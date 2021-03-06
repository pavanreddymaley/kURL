package runner

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"math/rand"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/pkg/errors"
	tghandlers "github.com/replicatedhq/kurl/testgrid/tgapi/pkg/handlers"
	"github.com/replicatedhq/kurl/testgrid/tgrun/pkg/runner/types"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	kubevirtv1 "kubevirt.io/client-go/api/v1"
)

var zero = int64(0)

func Run(singleTest types.SingleRun, uploadProxyURL, tempDir string) error {
	err := execute(singleTest, uploadProxyURL, tempDir)

	if err != nil {
		fmt.Println("execute failed")
		fmt.Println("  ID:", singleTest.ID)
		fmt.Println("  REF:", singleTest.KurlRef)
		fmt.Println("  ERROR:", err)
		if reportError := reportFailed(singleTest, err); reportError != nil {
			return errors.Wrap(err, "failed to report test failed")
		}
	}

	return nil
}

func reportStarted(singleTest types.SingleRun) error {
	startInstanceRequest := tghandlers.StartInstanceRequest{
		OSName:    singleTest.OperatingSystemName,
		OSVersion: singleTest.OperatingSystemVersion,
		OSImage:   singleTest.OperatingSystemImage,

		Memory: "16Gi",
		CPU:    "4",

		KurlSpec: singleTest.KurlYAML,
		KurlRef:  singleTest.KurlRef,
		KurlURL:  singleTest.KurlURL,
	}

	b, err := json.Marshal(startInstanceRequest)
	if err != nil {
		return errors.Wrap(err, "failed to marshal request")
	}

	req, err := http.NewRequest("POST", fmt.Sprintf("%s/v1/instance/%s/start", singleTest.TestGridAPIEndpoint, singleTest.ID), bytes.NewReader(b))
	if err != nil {
		return errors.Wrap(err, "failed to create request")
	}
	req.Header.Set("Content-Type", "application/json")
	_, err = http.DefaultClient.Do(req)
	if err != nil {
		return errors.Wrap(err, "failed to execute request")
	}

	return nil
}

func reportFailed(singleTest types.SingleRun, testErr error) error {
	return nil
}

// pathify OS image by removing non-alphanumeric characters
func urlToPath(url string) string {
	return regexp.MustCompile(`[^a-zA-Z0-9]`).ReplaceAllString(url, "")
}

func execute(singleTest types.SingleRun, uploadProxyURL, tempDir string) error {
	osImagePath := urlToPath(singleTest.OperatingSystemImage)

	_, err := os.Stat(filepath.Join(tempDir, osImagePath))
	if err != nil {
		fmt.Printf("  [downloading from %s]\n", singleTest.OperatingSystemImage)

		// Download the img
		resp, err := http.Get(singleTest.OperatingSystemImage)
		if err != nil {
			return errors.Wrap(err, "failed to get")
		}
		defer resp.Body.Close()

		// Create the file
		out, err := os.Create(filepath.Join(tempDir, osImagePath))
		if err != nil {
			return errors.Wrap(err, "failed to create image file")
		}
		defer out.Close()

		// Write the body to file
		_, err = io.Copy(out, resp.Body)
		if err != nil {
			return errors.Wrap(err, "failed to save vm image")
		}

		fmt.Printf("   [image downloaded]\n")
	} else {
		fmt.Printf("  [using existng image on disk at %s for %s]\n", filepath.Join(tempDir, osImagePath), singleTest.OperatingSystemImage)
	}

	cmd := exec.Command("kubectl",
		"virt",
		"image-upload",
		fmt.Sprintf("--uploadproxy-url=%s", uploadProxyURL),
		"--insecure",
		"--pvc-name",
		singleTest.PVCName,
		"--pvc-size=100Gi",
		fmt.Sprintf("--image-path=%s", filepath.Join(tempDir, osImagePath)),
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Printf("image-upload output: %s\n", output)
		return errors.Wrap(err, "kubectl apply pvc failed")
	}

	fmt.Printf("   [pvc created]\n")
	fmt.Printf("%s\n", output)

	if err := createSecret(singleTest, tempDir); err != nil {
		return errors.Wrap(err, "create secret failed")
	}
	fmt.Printf("   [secret created]\n")

	vmi := kubevirtv1.VirtualMachineInstance{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "kubevirt.io/v1alpha3",
			Kind:       "VirtualMachineInstance",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name: singleTest.ID,
			Labels: map[string]string{
				"kubevirt.io/domain": singleTest.ID,
			},
			Annotations: map[string]string{
				"testgrid.kurl.sh/osname":    singleTest.OperatingSystemName,
				"testgrid.kurl.sh/osversion": singleTest.OperatingSystemVersion,
				"testgrid.kurl.sh/osimage":   singleTest.OperatingSystemImage,
				"testgrid.kurl.sh/kurlurl":   singleTest.KurlURL,
			},
		},
		Spec: kubevirtv1.VirtualMachineInstanceSpec{
			Domain: kubevirtv1.DomainSpec{
				Machine: kubevirtv1.Machine{
					Type: "",
				},
				Resources: kubevirtv1.ResourceRequirements{
					Requests: corev1.ResourceList{
						corev1.ResourceName(corev1.ResourceMemory): resource.MustParse("16Gi"),
						corev1.ResourceName(corev1.ResourceCPU):    resource.MustParse("4"),
					},
				},
				Devices: kubevirtv1.Devices{
					Disks: []kubevirtv1.Disk{
						{
							Name: "pvcdisk",
							DiskDevice: kubevirtv1.DiskDevice{
								Disk: &kubevirtv1.DiskTarget{
									Bus: "virtio",
								},
							},
						},
						{
							Name: "cloudinitdisk",
							DiskDevice: kubevirtv1.DiskDevice{
								CDRom: &kubevirtv1.CDRomTarget{
									Bus: "sata",
								},
							},
						},
						getEmptyDisk("emptydisk1"),
					},
				},
			},
			TerminationGracePeriodSeconds: &zero,
			Volumes: []kubevirtv1.Volume{
				{
					Name: "pvcdisk",
					VolumeSource: kubevirtv1.VolumeSource{
						PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{
							ClaimName: singleTest.PVCName,
						},
					},
				},
				{
					Name: "cloudinitdisk",
					VolumeSource: kubevirtv1.VolumeSource{
						CloudInitNoCloud: &kubevirtv1.CloudInitNoCloudSource{
							UserDataSecretRef: &corev1.LocalObjectReference{
								Name: fmt.Sprintf("cloud-init-%s", singleTest.ID),
							},
						},
					},
				},
				getEmptyDiskVolume("emptydisk1", resource.MustParse("50Gi")),
			},
		},
	}

	// it would be nice to add the client-go from kubevirt, but
	// go mod is making it really hard
	b, err := json.Marshal(vmi)
	if err != nil {
		return errors.Wrap(err, "failed to marshal vmi")
	}
	if err := ioutil.WriteFile(filepath.Join(tempDir, "vmi.yaml"), b, 0644); err != nil {
		return errors.Wrap(err, "failed to write file")
	}

	// mark the instance started
	// we do this after the data volume is uploaded
	if err := reportStarted(singleTest); err != nil {
		return errors.Wrap(err, "failed to report test started")
	}

	cmd = exec.Command("kubectl",
		"apply",
		"-f",
		filepath.Join(tempDir, "vmi.yaml"),
	)

	output, err = cmd.CombinedOutput()
	if err != nil {
		fmt.Printf("%s\n", output)
		return errors.Wrap(err, "kubectl apply vmi failed")
	}

	fmt.Printf("   [vmi created]\n")
	fmt.Printf("%s\n", output)

	return nil
}

func createSecret(singleTest types.SingleRun, tempDir string) error {
	installCmd := `
curl $KURL_URL > install.sh
cat install.sh | timeout 30m bash
KURL_EXIT_STATUS=$?

export KUBECONFIG=/etc/kubernetes/admin.conf

echo "tasks.sh run:"
curl "$KURL_URL/tasks.sh" > tasks.sh
cat tasks.sh | timeout 5m bash -s join_token
echo "tasks exit status: $?"
echo ""
`

	if strings.HasSuffix(singleTest.KurlURL, ".tar.gz") {
		// this is an airgapped test
		installCmd = `
# get the install bundle
curl -L -o install.tar.gz $KURL_URL

# get the list of testgrid API IPs
command -v dig >/dev/null 2>&1 || { yum -y install bind-utils; }
command -v iptables >/dev/null 2>&1 || { yum -y install iptables; }
TESTGRID_DOMAIN=$(echo "$TESTGRID_APIENDPOINT" | sed -e "s.^https://..")
echo "testgrid API endpoint: $TESTGRID_APIENDPOINT domain: $TESTGRID_DOMAIN"
APIENDPOINT_IPS=$(dig $TESTGRID_DOMAIN | grep 'IN A' | awk '{ print $5 }')
# and allow access to them
for i in $APIENDPOINT_IPS; do
	echo "allowing access to $i"
	iptables -A OUTPUT -p tcp -d $i -j ACCEPT # accept comms to testgrid API IPs
done

# allow access to the local IP(s)
_count=0
_regex="^[[:digit:]]+: ([^[:space:]]+)[[:space:]]+[[:alnum:]]+ ([[:digit:].]+)"
while read -r _line; do
	[[ $_line =~ $_regex ]]
	if [ "${BASH_REMATCH[1]}" != "lo" ] && [ "${BASH_REMATCH[1]}" != "kube-ipvs0" ] && [ "${BASH_REMATCH[1]}" != "docker0" ] && [ "${BASH_REMATCH[1]}" != "weave" ]; then
		_iface_names[$((_count))]=${BASH_REMATCH[1]}
		_iface_addrs[$((_count))]=${BASH_REMATCH[2]}
		let "_count += 1"
	fi
done <<< "$(ip -4 -o addr)"
for i in $_iface_addrs; do
	echo "allowing access to local address $i"
	iptables -A OUTPUT -p tcp -d $i -j ACCEPT # accept comms to testgrid API IPs
done

# disable internet by adding restrictive iptables rules
iptables -A OUTPUT -p tcp -d 50.19.197.213 -j ACCEPT # accept comms to k8s.kurl.sh IPs
iptables -A OUTPUT -p tcp -d 54.236.144.143 -j ACCEPT # accept comms to k8s.kurl.sh IPs
iptables -A OUTPUT -p tcp -d 162.159.135.41 -j ACCEPT # accept comms to k8s.kurl.sh IPs
iptables -A OUTPUT -p tcp -d 162.159.136.41 -j ACCEPT # accept comms to k8s.kurl.sh IPs
iptables -A OUTPUT -p tcp -d 127.0.0.1 -j ACCEPT # accept comms to localhost
iptables -A OUTPUT -p tcp -d 10.0.0.0/8 -j ACCEPT # accept comms to internal IPs
iptables -A OUTPUT -p tcp -d 172.16.0.0/12 -j ACCEPT # accept comms to internal IPs
iptables -A OUTPUT -p tcp -d 192.168.0.0/16 -j ACCEPT # accept comms to internal IPs
iptables -A OUTPUT -p tcp -j REJECT # reject comms to other IPs

iptables -L

# test the lack of internet access
echo "testing disabled internet"
curl -v --connect-timeout 5 --max-time 5 "http://www.google.com"
CURL_EXIT_STATUS=$?
if [ $CURL_EXIT_STATUS -eq 0 ]; then
    echo "successfully curled an external endpoint in airgap"
    traceroute www.google.com
    curl -s -X POST -d "{\"success\": false}" $TESTGRID_APIENDPOINT/v1/instance/$TEST_ID/finish
    curl -X POST --data-binary "@/var/log/cloud-init-output.log" $TESTGRID_APIENDPOINT/v1/instance/$TEST_ID/logs
    exit 1
fi

# run the installer
tar -xzvf install.tar.gz
TAR_EXIT_STATUS=$?
if [ $TAR_EXIT_STATUS -ne 0 ]; then
    echo "failed to unpack airgap file with status $TAR_EXIT_STATUS"
    curl -s -X POST -d "{\"success\": false}" $TESTGRID_APIENDPOINT/v1/instance/$TEST_ID/finish
    curl -X POST --data-binary "@/var/log/cloud-init-output.log" $TESTGRID_APIENDPOINT/v1/instance/$TEST_ID/logs
    exit 1
fi

cat install.sh | timeout 30m bash -s airgap
KURL_EXIT_STATUS=$?

export KUBECONFIG=/etc/kubernetes/admin.conf

echo "running pods after completion:"
kubectl get pods -A
echo ""

echo "tasks.sh run:"
cat tasks.sh | timeout 5m bash -s join_token
echo "tasks exit status: $?"
echo ""
`
	}

	upgradeCmd := ""

	if singleTest.UpgradeURL != "" {
		upgradeCmd = fmt.Sprintf(`
KURL_UPGRADE_URL='%s'

echo "upgrading installation"

curl $KURL_UPGRADE_URL > upgrade.sh
cat upgrade.sh | timeout 30m bash
KURL_EXIT_STATUS=$?

echo "";

if [ $KURL_EXIT_STATUS -eq 0 ]; then
    echo "completed kurl upgrade"
    echo ""
    echo "kubectl version:"
    kubectl version
    echo ""
else
    echo "failed kurl upgrade with exit status $KURL_EXIT_STATUS"
    curl -s -X POST -d "{\"success\": false}" $TESTGRID_APIENDPOINT/v1/instance/$TEST_ID/finish
fi
`, singleTest.UpgradeURL)

		if strings.HasSuffix(singleTest.UpgradeURL, ".tar.gz") {
			upgradeCmd = fmt.Sprintf(`
KURL_UPGRADE_URL='%s'

echo "upgrading installation"


# get the upgrade bundle
curl -L -o upgrade.tar.gz KURL_UPGRADE_URL

# get the list of testgrid API IPs
command -v dig >/dev/null 2>&1 || { yum -y install bind-utils; }
command -v iptables >/dev/null 2>&1 || { yum -y install iptables; }
TESTGRID_DOMAIN=$(echo "$TESTGRID_APIENDPOINT" | sed -e "s.^https://..")
echo "testgrid API endpoint: $TESTGRID_APIENDPOINT domain: $TESTGRID_DOMAIN"
APIENDPOINT_IPS=$(dig $TESTGRID_DOMAIN | grep 'IN A' | awk '{ print $5 }')
# and allow access to them
for i in $APIENDPOINT_IPS; do
	echo "allowing access to $i"
	iptables -A OUTPUT -p tcp -d $i -j ACCEPT # accept comms to testgrid API IPs
done

# allow access to the local IP(s)
_count=0
_regex="^[[:digit:]]+: ([^[:space:]]+)[[:space:]]+[[:alnum:]]+ ([[:digit:].]+)"
while read -r _line; do
	[[ $_line =~ $_regex ]]
	if [ "${BASH_REMATCH[1]}" != "lo" ] && [ "${BASH_REMATCH[1]}" != "kube-ipvs0" ] && [ "${BASH_REMATCH[1]}" != "docker0" ] && [ "${BASH_REMATCH[1]}" != "weave" ]; then
		_iface_names[$((_count))]=${BASH_REMATCH[1]}
		_iface_addrs[$((_count))]=${BASH_REMATCH[2]}
		let "_count += 1"
	fi
done <<< "$(ip -4 -o addr)"
for i in $_iface_addrs; do
	echo "allowing access to local address $i"
	iptables -A OUTPUT -p tcp -d $i -j ACCEPT # accept comms to testgrid API IPs
done

# disable internet by adding restrictive iptables rules
iptables -A OUTPUT -p tcp -d 50.19.197.213 -j ACCEPT # accept comms to k8s.kurl.sh IPs
iptables -A OUTPUT -p tcp -d 54.236.144.143 -j ACCEPT # accept comms to k8s.kurl.sh IPs
iptables -A OUTPUT -p tcp -d 162.159.135.41 -j ACCEPT # accept comms to k8s.kurl.sh IPs
iptables -A OUTPUT -p tcp -d 162.159.136.41 -j ACCEPT # accept comms to k8s.kurl.sh IPs
iptables -A OUTPUT -p tcp -d 127.0.0.1 -j ACCEPT # accept comms to localhost
iptables -A OUTPUT -p tcp -d 10.0.0.0/8 -j ACCEPT # accept comms to internal IPs
iptables -A OUTPUT -p tcp -d 172.16.0.0/12 -j ACCEPT # accept comms to internal IPs
iptables -A OUTPUT -p tcp -d 192.168.0.0/16 -j ACCEPT # accept comms to internal IPs
iptables -A OUTPUT -p tcp -j REJECT # reject comms to other IPs

iptables -L

# test the lack of internet access
echo "testing disabled internet"
curl -v --connect-timeout 5 --max-time 5 "http://www.google.com"
CURL_EXIT_STATUS=$?
if [ $CURL_EXIT_STATUS -eq 0 ]; then
    echo "successfully curled an external endpoint in airgap"
    traceroute www.google.com
    curl -s -X POST -d "{\"success\": false}" $TESTGRID_APIENDPOINT/v1/instance/$TEST_ID/finish
    curl -X POST --data-binary "@/var/log/cloud-init-output.log" $TESTGRID_APIENDPOINT/v1/instance/$TEST_ID/logs
    exit 1
fi

# run the upgrade
tar -xzvf upgrade.tar.gz
TAR_EXIT_STATUS=$?
if [ $TAR_EXIT_STATUS -ne 0 ]; then
    echo "failed to unpack airgap file with status $TAR_EXIT_STATUS"
    curl -s -X POST -d "{\"success\": false}" $TESTGRID_APIENDPOINT/v1/instance/$TEST_ID/finish
    curl -X POST --data-binary "@/var/log/cloud-init-output.log" $TESTGRID_APIENDPOINT/v1/instance/$TEST_ID/logs
    exit 1
fi

cat install.sh | timeout 30m bash -s airgap
KURL_EXIT_STATUS=$?

echo "";
echo "running pods after completion:";
kubectl get pods -A
echo "";

if [ $KURL_EXIT_STATUS -eq 0 ]; then
    echo "completed kurl upgrade"
    echo ""
    echo "kubectl version:"
    kubectl version
    echo ""
else
    echo "failed kurl upgrade with exit status $KURL_EXIT_STATUS"
    curl -s -X POST -d "{\"success\": false}" $TESTGRID_APIENDPOINT/v1/instance/$TEST_ID/finish
fi
`, singleTest.UpgradeURL)
		}
	}

	runcmd := fmt.Sprintf(`# runcmd.sh
#!/bin/bash

TESTGRID_APIENDPOINT='%s'
TEST_ID='%s'
KURL_URL='%s'

setenforce 0 || true # rhel variants

curl -X POST $TESTGRID_APIENDPOINT/v1/instance/$TEST_ID/running

echo "running kurl installer"

echo "$TEST_ID" > /tmp/testgrid-id

if [ ! -c /dev/urandom ]; then
    /bin/mknod -m 0666 /dev/urandom c 1 9 && /bin/chown root:root /dev/urandom
fi

%s

echo "";

if [ $KURL_EXIT_STATUS -eq 0 ]; then
    echo "completed kurl run"
else
    echo "failed kurl run with exit status $KURL_EXIT_STATUS"

    echo "kubelet status"
    systemctl status kubelet
    echo "kubelet journalctl"
    journalctl -xeu kubelet
    echo "docker containers"
    docker ps -a

    curl -s -X POST -d "{\"success\": false}" $TESTGRID_APIENDPOINT/v1/instance/$TEST_ID/finish
fi

%s

curl -X POST --data-binary "@/var/log/cloud-init-output.log" $TESTGRID_APIENDPOINT/v1/instance/$TEST_ID/logs

echo "collecting support bundle"

/usr/local/bin/kubectl-support_bundle https://kots.io
SUPPORT_BUNDLE=$(ls -1 ./ | grep support-bundle-)
if [ -n "$SUPPORT_BUNDLE" ]; then
    echo "completed support bundle collection"
    curl -X POST --data-binary "@./$SUPPORT_BUNDLE" $TESTGRID_APIENDPOINT/v1/instance/$TEST_ID/bundle
else
    echo "failed support bundle collection"
fi

if [ $KURL_EXIT_STATUS -ne 0 ]; then
    exit 1
fi

echo "running sonobuoy"
curl -L --output ./sonobuoy.tar.gz https://github.com/vmware-tanzu/sonobuoy/releases/download/v0.19.0/sonobuoy_0.19.0_linux_amd64.tar.gz
tar xzvf ./sonobuoy.tar.gz

./sonobuoy run --wait --mode quick

RESULTS=$(./sonobuoy retrieve)
if [ -n "$RESULTS" ]; then
    echo "completed sonobuoy run"
    ./sonobuoy results $RESULTS > ./sonobuoy-results.txt
    curl -X POST --data-binary "@./sonobuoy-results.txt" $TESTGRID_APIENDPOINT/v1/instance/$TEST_ID/sonobuoy
else
    echo "failed sonobuoy run"
fi

curl -X POST -d '{"success": true}' $TESTGRID_APIENDPOINT/v1/instance/$TEST_ID/finish
`,
		singleTest.TestGridAPIEndpoint, singleTest.ID, singleTest.KurlURL, installCmd, upgradeCmd,
	)
	runcmdB64 := base64.StdEncoding.EncodeToString([]byte(runcmd))

	script := fmt.Sprintf(`#cloud-config

password: kurl
chpasswd: { expire: False }

output: { all: "| tee -a /var/log/cloud-init-output.log" }

runcmd:
  - [ bash, -c, 'sudo mkdir -p /opt/kurl-testgrid' ]
  - [ bash, -c, 'echo %s | base64 -d > /opt/kurl-testgrid/runcmd.sh' ]
  - [ bash, -c, 'cd /opt/kurl-testgrid && sudo bash runcmd.sh' ]
  - [ bash, -c, 'sleep 10 && sudo poweroff' ]

power_state:
  mode: poweroff
  condition: True
`,
		runcmdB64,
	)

	file := filepath.Join(tempDir, "startup-script.sh")

	if err := ioutil.WriteFile(file, []byte(script), 0755); err != nil {
		return errors.Wrap(err, "failed to write secret to file")
	}
	defer os.Remove(file)

	cmd := exec.Command("kubectl", "create", "secret", "generic",
		fmt.Sprintf("cloud-init-%s", singleTest.ID),
		fmt.Sprintf("--from-file=userdata=%s", file),
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Printf("%s\n", output)
		return errors.Wrap(err, "kubectl create secret failed")
	}

	return nil
}

func getEmptyDisk(name string) kubevirtv1.Disk {
	return kubevirtv1.Disk{
		Name:   name,
		Serial: randomStringWithCharset(serialLen, serialCharset),
		DiskDevice: kubevirtv1.DiskDevice{
			Disk: &kubevirtv1.DiskTarget{
				Bus: "virtio",
			},
		},
	}
}

func getEmptyDiskVolume(name string, capacity resource.Quantity) kubevirtv1.Volume {
	return kubevirtv1.Volume{
		Name: name,
		VolumeSource: kubevirtv1.VolumeSource{
			EmptyDisk: &kubevirtv1.EmptyDiskSource{
				Capacity: capacity,
			},
		},
	}
}

const (
	serialLen     = 16
	serialCharset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
)

var seededRand *rand.Rand = rand.New(rand.NewSource(time.Now().UnixNano()))

func randomStringWithCharset(length int, charset string) string {
	b := make([]byte, length)
	for i := range b {
		b[i] = charset[seededRand.Intn(len(charset))]
	}
	return string(b)
}
