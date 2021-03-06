import {describe, it} from "mocha";
import {expect} from "chai";
import { Installer } from "../../installers";
import * as _ from "lodash";

const everyOption = `apiVersion: kurl.sh/v1beta1
metadata:
  name: everyOption
spec:
  kubernetes:
    version: latest
    serviceCidrRange: /12
    serviceCIDR: 100.1.1.1/12
    HACluster: false
    masterAddress: 192.168.1.1
    loadBalancerAddress: 10.128.10.1
    bootstrapToken: token
    bootstrapTokenTTL: 10min
    kubeadmTokenCAHash: hash
    controlPlane: false
    certKey: key
  docker:
    version: latest
    bypassStorageDriverWarnings: false
    hardFailOnLoopback: false
    noCEOnEE: false
    dockerRegistryIP: 192.168.0.1
    additionalNoProxy: 129.168.0.2
    noDocker: false
  weave:
    version: latest
    encryptNetwork: true
    podCidrRange: /12
    podCIDR: 39.1.2.3
  contour:
    version: latest
    tlsMinimumProtocolVersion: "1.3"
    httpPort: 3080
    httpsPort: 3443
  rook:
    version: latest
    storageClassName: default
    cephReplicaCount: 1
    isBlockStorageEnabled: true
    blockDeviceFilter: sd[a-z]
    hostpathRequiresPrivileged: true
  openebs:
    version: latest
    namespace: openebs
    isLocalPVEnabled: true
    localPVStorageClassName: default
    isCstorEnabled: true
    cstorStorageClassName: cstor
  minio:
    version: latest
    namespace: minio
    hostPath: /sentry
  registry:
    version: latest
    publishPort: 20
  prometheus:
    version: latest
  fluentd:
    version: latest
    fullEFKStack: false
  kotsadm:
    version: latest
    applicationSlug: sentry
    uiBindPort: 8800
    applicationNamespace: kots
    hostname: 1.1.1.1
  velero:
    version: latest
    namespace: velero
    disableCLI: false
    disableRestic: false
    localBucket: local
    resticRequiresPrivileged: false
  ekco:
    version: latest
    nodeUnreachableToleration: 10m
    minReadyMasterNodeCount: 3
    minReadyWorkerNodeCount: 1
    shouldDisableRebootService: false
    shouldDisableClearNodes: false
    shouldEnablePurgeNodes: false
    rookShouldUseAllNodes: false
  kurl:
    proxyAddress: 1.1.1.1
    additionalNoProxyAddresses:
    - 10.128.0.3
    airgap: false
    bypassFirewalldWarning: false
    hardFailOnFirewalld: false
    hostnameCheck: 2.2.2.2
    noProxy: false
    privateAddress: 10.38.1.1
    publicAddress: 101.38.1.1
    nameserver: 8.8.8.8
  collectd:
    version: 0.0.1
  certManager:
    version: 1.0.3
  metricsServer:
    version: 0.3.7
  helm:
    helmfileSpec: |
      repositories:
      - name: nginx-stable
        url: https://helm.nginx.com/stable
      releases:
      - name: test-nginx-ingress
        chart: nginx-stable/nginx-ingress
        values:
        - controller:
            service:
              type: NodePort
              httpPort:
                nodePort: 30080
              httpsPort:
                nodePort: 30443
    additionalImages:
    - postgres
`;

// Used for validation in all options test case
const helmfileSpec=`repositories:
- name: nginx-stable
  url: https://helm.nginx.com/stable
releases:
- name: test-nginx-ingress
  chart: nginx-stable/nginx-ingress
  values:
  - controller:
      service:
        type: NodePort
        httpPort:
          nodePort: 30080
        httpsPort:
          nodePort: 30443
`


const typeMetaStableV1Beta1 = `
apiVersion: kurl.sh/v1beta1
kind: Installer
metadata:
  name: stable
spec:
  kubernetes:
    version: 1.15.2
  weave:
    version: 2.5.2
  rook:
    version: 1.0.4
  contour:
    version: 0.14.0
  registry:
    version: 2.7.1
  prometheus:
    version: 0.33.0
`;

const stable = `
metadata:
  name: stable
spec:
  kubernetes:
    version: 1.15.2
  weave:
    version: 2.5.2
  rook:
    version: 1.0.4
  contour:
    version: 0.14.0
  registry:
    version: 2.7.1
  prometheus:
    version: 0.33.0
`;

const noName = `
spec:
  kubernetes:
    version: 1.15.2
  weave:
    version: 2.5.2
  rook:
    version: 1.0.4
  contour:
    version: 0.14.0
  registry:
    version: 2.7.1
  prometheus:
    version: 0.33.0
`;

const disordered = `
spec:
  contour:
    version: 0.14.0
  weave:
    version: 2.5.2
  prometheus:
    version: 0.33.0
  kubernetes:
    version: 1.15.2
  registry:
    version: 2.7.1
  rook:
    version: 1.0.4
`;

const k8s14 = `
spec:
  kubernetes:
    version: 1.14.5
  weave:
    version: 2.5.2
  rook:
    version: 1.0.4
  contour:
    version: 0.14.0
  registry:
    version: 2.7.1
  prometheus:
    version: 0.33.0
`;

const min = `
spec:
  kubernetes:
    version: 1.15.1
`;

const empty = "";

const kots = `
spec:
  kubernetes:
    version: latest
  kotsadm:
    version: 0.9.9
    applicationSlug: sentry-enterprise
`;

const kotsNoSlug = `
spec:
  kubernetes:
    version: latest
  kotsadm:
    version: 0.9.9
`;

const kotsNoVersion = `
spec:
  kubernetes:
    version: latest
  kotsadm:
    applicationSlug: sentry-enterprise
`;

const velero = `
spec:
  velero:
    version: latest
    namespace: not-velero
    installCLI: false
    useRestic: false
`;

const veleroMin = `
spec:
  velero:
    version: latest
`;

const veleroDefaults = `
spec:
  velero:
    version: latest
    namespace: velero
`;

const fluentd = `
spec:
  fluentd:
    version: latest
    fullEFKStack: true
`;

const fluentdMin = `
spec:
  fluentd:
    version: latest
`;

const ekco = `
spec:
  ekco:
    version: latest
    nodeUnreachableToleration: 10m
    minReadyMasterNodeCount: 3
    minReadyWorkerNodeCount: 1
    shouldDisableRebootService: false
    shouldDisableClearNodes: false
    shouldEnablePurgeNodes: false
    rookShouldUseAllNodes: false
`;

const ekcoMin = `
spec:
  ekco:
    version: latest
`;

const contour = `
spec:
  contour:
    version: latest
    tlsMinimumProtocolVersion: "1.3"
    httpPort: 3080
    httpsPort: 3443
`;

const minio = `
spec:
  minio:
    version: latest
    namespace: minio
    hostPath: /sentry
`;

const openebs = `
spec:
  openebs:
    version: latest
    isLocalPVEnabled: true
    localPVStorageClassName: default
    isCstorEnabled: true
    cstorStorageClassName: cstor
`;

const overrideUnknownVersion = `
spec:
  kubernetes:
    version: latest
  contour:
    version: 100.0.0
    tlsMinimumProtocolVersion: "1.3"
    s3Override: https://dummy.s3.us-east-1.amazonaws.com/pr/contour-100.0.0.tar.gz
`;

const overrideKnownVersion = `
spec:
  contour:
    version: latest
    tlsMinimumProtocolVersion: "1.3"
    httpPort: 3080
    httpsPort: 3443
    s3Override: https://dummy.s3.us-east-1.amazonaws.com/pr/contour-100.0.0.tar.gz
`;

describe("Installer", () => {
  describe("parse", () => {
    it("parses yaml with type meta and name", () => {
      const i = Installer.parse(typeMetaStableV1Beta1);
      expect(i).to.have.property("id", "stable");
      expect(i.spec.kubernetes).to.have.property("version", "1.15.2");
      expect(i.spec.weave).to.have.property("version", "2.5.2");
      expect(i.spec.rook).to.have.property("version", "1.0.4");
      expect(i.spec.contour).to.have.property("version", "0.14.0");
      expect(i.spec.registry).to.have.property("version", "2.7.1");
      expect(i.spec.prometheus).to.have.property("version", "0.33.0");
    });

    it("parses yaml with name and no type meta", () => {
      const i = Installer.parse(stable);
      expect(i).to.have.property("id", "stable");
      expect(i.spec.kubernetes).to.have.property("version", "1.15.2");
      expect(i.spec.weave).to.have.property("version", "2.5.2");
      expect(i.spec.rook).to.have.property("version", "1.0.4");
      expect(i.spec.contour).to.have.property("version", "0.14.0");
      expect(i.spec.registry).to.have.property("version", "2.7.1");
      expect(i.spec.prometheus).to.have.property("version", "0.33.0");
    });

    it("parses yaml with only a spec", () => {
      const i = Installer.parse(noName);
      expect(i).to.have.property("id", "");
      expect(i.spec.kubernetes).to.have.property("version", "1.15.2");
      expect(i.spec.weave).to.have.property("version", "2.5.2");
      expect(i.spec.rook).to.have.property("version", "1.0.4");
      expect(i.spec.contour).to.have.property("version", "0.14.0");
      expect(i.spec.registry).to.have.property("version", "2.7.1");
      expect(i.spec.prometheus).to.have.property("version", "0.33.0");
    });

    it("parses yaml spec in different order", () => {
      const i = Installer.parse(disordered);
      expect(i).to.have.property("id", "");
      expect(i.spec.kubernetes).to.have.property("version", "1.15.2");
      expect(i.spec.weave).to.have.property("version", "2.5.2");
      expect(i.spec.rook).to.have.property("version", "1.0.4");
      expect(i.spec.contour).to.have.property("version", "0.14.0");
      expect(i.spec.registry).to.have.property("version", "2.7.1");
      expect(i.spec.prometheus).to.have.property("version", "0.33.0");
    });

    it("parses yaml spec with empty versions", () => {
      const i = Installer.parse(min);
      expect(i).to.have.property("id", "");
      expect(i.spec.kubernetes).to.have.property("version", "1.15.1");
      expect(i.spec).not.to.have.property("weave");
      expect(i.spec).not.to.have.property("rook");
      expect(i.spec).not.to.have.property("contour");
      expect(i.spec).not.to.have.property("registry");
      expect(i.spec).not.to.have.property("kotsadm");
      expect(i.spec).not.to.have.property("docker");
      expect(i.spec).not.to.have.property("prometheus");
      expect(i.spec).not.to.have.property("velero");
      expect(i.spec).not.to.have.property("fluentd");
    });

    it("parses yaml spec with override s3 urls and unknown versions", () => {
      const i = Installer.parse(overrideUnknownVersion);
      expect(i).to.have.property("id", "");
      expect(i.spec.contour).to.have.property("version", "100.0.0");
      expect(i.spec.contour).to.have.property("s3Override", "https://dummy.s3.us-east-1.amazonaws.com/pr/contour-100.0.0.tar.gz");
    });
  });

  describe("hash", () => {
    it("hashes same specs to the same string", () => {
      const a = Installer.parse(typeMetaStableV1Beta1).hash();
      const b = Installer.parse(stable).hash();
      const c = Installer.parse(noName).hash();
      const d = Installer.parse(disordered).hash();

      expect(a).to.equal(b);
      expect(a).to.equal(c);
      expect(a).to.equal(d);
    });

    it("hashes different specs to different strings", () => {
      const a = Installer.parse(typeMetaStableV1Beta1).hash();
      const b = Installer.parse(k8s14).hash();

      expect(a).not.to.equal(b);
    });

    it("hashes to a 7 character hex string", () => {
      const a = Installer.parse(typeMetaStableV1Beta1).hash();
      const b = Installer.parse(k8s14).hash();

      expect(a).to.match(/[0-9a-f]{7}/);
      expect(b).to.match(/[0-9a-f]{7}/);
    });

    it("hashes old versions to equivalent migrated version", () => {
      const parsedV1Beta1 = Installer.parse(typeMetaStableV1Beta1);
    });

    it("hashes specs with override to different strings", () => {
      const a = Installer.parse(contour).hash();
      const b = Installer.parse(overrideKnownVersion).hash();

      expect(a).not.to.equal(b);
    });

    it("hashes specs with helmfile values differently", () => {
      const helm1 = `spec:
  kubernetes:
    version: latest
  helm:
    helmfileSpec: |
      repositories
      - name: nginx
        repo: nginx.com`;

        const helm2 = `spec:
  kubernetes:
    version: latest
  helm:
    helmfileSpec: |
      repositories
      - name: postgres
        repo: postgres.com`;

      const a = Installer.parse(helm1).hash();
      const b = Installer.parse(helm2).hash();

      expect(a).not.to.equal(b);
    });
  });

  describe("toYAML", () => {
    describe("v1beta1", () => {
      it("leaves missing names empty", () => {
        const parsed = Installer.parse(noName);
        const yaml = parsed.toYAML();

        expect(yaml).to.equal(`apiVersion: cluster.kurl.sh/v1beta1
kind: Installer
metadata:
  name: ''
spec:
  kubernetes:
    version: 1.15.2
  weave:
    version: 2.5.2
  rook:
    version: 1.0.4
  contour:
    version: 0.14.0
  registry:
    version: 2.7.1
  prometheus:
    version: 0.33.0
`);
      });

      it("renders empty yaml", () => {
        const parsed = Installer.parse(empty);
        const yaml = parsed.toYAML();

        expect(yaml).to.equal(`apiVersion: cluster.kurl.sh/v1beta1
kind: Installer
metadata:
  name: ''
spec:
  kubernetes:
    version: ''
`);
      });
    });
  });

  describe("Installer.isSHA", () => {
    [
      { id: "d3a9234", answer: true },
      { id: "6898644", answer: true },
      { id: "0000000", answer: true},
      { id: "abcdefa", answer: true},
      { id: "68986440", answer: false },
      { id: "d3a923", answer: false },
      { id: "latest", answer: false },
      { id: "f3a9g34", answer: false },
      { id: "replicated-beta", answer: false },
      { id: "replicated d3a9234", answer: false },
    ].forEach((test) => {
      it(`${test.id} => ${test.answer}`, () => {
        const output = Installer.isSHA(test.id);

        expect(Installer.isSHA(test.id)).to.equal(test.answer);
      });
    });
  });

  describe("Installer.isValidSlug", () => {
    [
      { slug: "ok", answer: true },
      { slug: "", answer: false},
      { slug: " ", answer: false},
      { slug: "big-bank-beta", answer: true},
      { slug: _.range(0, 255).map((x) => "a").join(""), answer: true },
      { slug: _.range(0, 256).map((x) => "a").join(""), answer: false },
    ].forEach((test) => {
      it(`"${test.slug}" => ${test.answer}`, () => {
        const output = Installer.isValidSlug(test.slug);

        expect(Installer.isValidSlug(test.slug)).to.equal(test.answer);
      });
    });
  });

  describe("Installer.isValidCidrRange", () => {
    [
      { cidrRange: "/12", answer: true },
      { cidrRange: "12", answer: true},
      { cidrRange: " ", answer: false},
      { cidrRange: "abc", answer: false},
    ].forEach((test) => {
      it(`"${test.cidrRange}" => ${test.answer}`, () => {
        const output = Installer.isValidCidrRange(test.cidrRange);

        expect(Installer.isValidCidrRange(test.cidrRange)).to.equal(test.answer);
      });
    });
  });

  describe("validate", () => {
    describe("valid", () => {
      it("=> void", () => {
        [
          typeMetaStableV1Beta1,
        ].forEach(async (yaml) => {
          const out = Installer.parse(yaml).validate();

          expect(out).to.equal(undefined);
        });
      });

      describe("application slug exists", () => {
        it("=> void", () => {
          const out = Installer.parse(kots).validate();

          expect(out).to.equal(undefined);
        });
      });

      describe("every option", () => {
        it("=> void", () => {
          const out = Installer.parse(everyOption).validate();

          expect(out).to.equal(undefined);
        });
      });

      describe("unknown versions w/ overrides", () => {
        it("=> void", () => {
          const out = Installer.parse(overrideUnknownVersion).validate();
          expect(out).to.equal(undefined);
        });
      });
    });

    describe("invalid Kubernetes versions", () => {
      it("=> ErrorResponse", () => {
        const noK8s = `
spec:
  kubernetes:
    version: ""
`;
        const noK8sOut = Installer.parse(noK8s).validate();
        expect(noK8sOut).to.deep.equal({ error: { message: "Kubernetes version is required" } });

        const badK8s = `
spec:
  kubernetes:
    version: "0.15.3"
`;
        const badK8sOut = Installer.parse(badK8s).validate();
        expect(badK8sOut).to.deep.equal({ error: { message: "Kubernetes version 0.15.3 is not supported" } });
      });
    });

    describe("invalid Prometheus version", () => {
      it("=> ErrorResponse", () => {
        const yaml = `
spec:
  kubernetes:
    version: latest
  prometheus:
    version: 0.32.0
`;
        const out = Installer.parse(yaml).validate();

        expect(out).to.deep.equal({ error: { message: `Prometheus version "0.32.0" is not supported` } });
      });
    });

    describe("kots version missing", () => {
      it("=> ErrorResponse", () => {
        const out = Installer.parse(kotsNoVersion).validate();

        expect(out).to.deep.equal({ error: { message: "spec.kotsadm should have required property 'version'" }});
      });
    });

    describe("docker version is a boolean", () => {
      const yaml = `
spec:
  kubernetes:
    version: latest
  docker:
    version: true`;
      const i = Installer.parse(yaml);
      const out = i.validate();

      expect(out).to.deep.equal({ error: { message: "spec.docker.version should be string" } });
    });

    describe("invalid podCidrRange", () => {
      const yaml = `
spec:
  kubernetes:
    version: latest
  weave:
    version: latest
    podCidrRange: abc`;
      const i = Installer.parse(yaml);
      const out = i.validate();

      expect(out).to.deep.equal({ error: { message: "Weave podCidrRange \"abc\" is invalid" } });
    });

    describe("invalid serviceCidrRange", () => {
      const yaml = `
spec:
  kubernetes:
    version: latest
    serviceCidrRange: abc`;
      const i = Installer.parse(yaml);
      const out = i.validate();

      expect(out).to.deep.equal({ error: { message: "Kubernetes serviceCidrRange \"abc\" is invalid" } });
    });

    describe("extra options", () => {
      it("=> ErrorResponse", () => {
        const yaml = `
spec:
  kubernetes:
    version: latest
    seLinux: true`;
        const i = Installer.parse(yaml);
        const out = i.validate();

        expect(out).to.deep.equal({ error: { message: "spec.kubernetes should NOT have additional properties" } });
      });
    });
  });

  describe("hasS3Override", () => {
    it(`hasS3Override false for k8s in stable spec`, () => {
      const i = Installer.parse(stable);
      expect(i.hasS3Override("kubernetes")).to.be.false;
    });

    it(`hasS3Override true for contour with s3 override set`, () => {
      const i = Installer.parse(overrideUnknownVersion);
      expect(i.hasS3Override("contour")).to.be.true;
    });
  });

  describe("flags", () => {
    describe("every option", () => {
      it(`=> service-cidr-range=/12 ...`, () => {
        const i = Installer.parse(everyOption);

          expect(i.flags()).to.equal(`service-cidr-range=/12 service-cidr=100.1.1.1/12 ha=0 kuberenetes-master-address=192.168.1.1 load-balancer-address=10.128.10.1 bootstrap-token=token bootstrap-token-ttl=10min kubeadm-token-ca-hash=hash control-plane=0 cert-key=key bypass-storagedriver-warnings=0 hard-fail-on-loopback=0 no-ce-on-ee=0 docker-registry-ip=192.168.0.1 additional-no-proxy=129.168.0.2 no-docker=0 pod-cidr=39.1.2.3 pod-cidr-range=/12 disable-weave-encryption=0 storage-class-name=default ceph-replica-count=1 rook-block-storage-enabled=1 rook-block-device-filter=sd[a-z] rook-hostpath-requires-privileged=1 openebs-namespace=openebs openebs-localpv-enabled=1 openebs-localpv-storage-class-name=default openebs-cstor-enabled=1 openebs-cstor-storage-class-name=cstor minio-namespace=minio minio-hostpath=/sentry contour-tls-minimum-protocol-version=1.3 contour-http-port=3080 contour-https-port=3443 registry-publish-port=20 fluentd-full-efk-stack=0 kotsadm-application-slug=sentry kotsadm-ui-bind-port=8800 kotsadm-hostname=1.1.1.1 kotsadm-application-namespaces=kots velero-namespace=velero velero-disable-cli=0 velero-disable-restic=0 velero-local-bucket=local velero-restic-requires-privileged=0 ekco-node-unreachable-toleration-duration=10m ekco-min-ready-master-node-count=3 ekco-min-ready-worker-node-count=1 ekco-should-disable-reboot-service=0 ekco-rook-should-use-all-nodes=0 http-proxy=1.1.1.1 airgap=0 bypass-firewalld-warning=0 hard-fail-on-firewalld=0 hostname-check=2.2.2.2 no-proxy=0 private-address=10.38.1.1 public-address=101.38.1.1 helmfile-spec=${helmfileSpec}`);
      });
    });
  });

  describe("velero", () => {
    it("should parse", () => {
      const i = Installer.parse(velero);

      expect(i.spec.velero).to.deep.equal({
        version: "latest",
        namespace: "not-velero",
        installCLI: false,
        useRestic: false,
      });
    });
  });

  describe("velero minimum spec flags", () => {
    it("should not generate any flags", () => {
      const i = Installer.parse(veleroMin);

      expect(i.flags()).to.equal(``);
    });
  });

  describe("velero defaults", () => {
    it("should generate only the velero-namespace flag", () => {
      const i = Installer.parse(veleroDefaults);

      expect(i.flags()).to.equal(`velero-namespace=velero`);
    });
  });

  describe("fluentd", () => {
    it("should parse", () => {
      const i = Installer.parse(fluentd);

      expect(i.spec.fluentd).to.deep.equal({
        version: "latest",
        fullEFKStack: true,
      });
    });
  });

  describe("fluentd minimum spec flags", () => {
    it("should not generate any flags", () => {
      const i = Installer.parse(fluentdMin);

      expect(i.flags()).to.equal(``);
    });
  });

  describe("openebs", () => {
    it("should parse", () => {
      const i = Installer.parse(everyOption);

      expect(i.spec.openebs.namespace).to.equal("openebs");
    });
  });

  describe("ekco", () => {
    it("should parse", () => {
      const i = Installer.parse(ekco);

      expect(i.spec.ekco).to.deep.equal({
        version: "latest",
        nodeUnreachableToleration: "10m",
        minReadyMasterNodeCount: 3,
        minReadyWorkerNodeCount: 1,
        shouldDisableRebootService: false,
        shouldDisableClearNodes: false,
        shouldEnablePurgeNodes: false,
        rookShouldUseAllNodes: false,
      });
        expect(i.flags()).to.equal("ekco-node-unreachable-toleration-duration=10m ekco-min-ready-master-node-count=3 ekco-min-ready-worker-node-count=1 ekco-should-disable-reboot-service=0 ekco-rook-should-use-all-nodes=0")
    });
  });

  describe("contour", () => {
    it("should parse", () => {
      const i = Installer.parse(contour);

      expect(i.spec.contour).to.deep.equal({
        version: "latest",
        tlsMinimumProtocolVersion: "1.3",
        httpPort: 3080,
        httpsPort: 3443,
      });
      
      expect(i.flags()).to.equal("contour-tls-minimum-protocol-version=1.3 contour-http-port=3080 contour-https-port=3443")
    });
  });

  describe("minio", () => {
    it("should parse", () => {
      const i = Installer.parse(minio);

      expect(i.spec.minio).to.deep.equal({
        version: "latest",
        namespace: "minio",
        hostPath: "/sentry",
      });
      
      expect(i.flags()).to.equal("minio-namespace=minio minio-hostpath=/sentry")
    });
  });

  describe("ekco minimum spec flags", () => {
    it("should not generate any flags", () => {
      const i = Installer.parse(ekcoMin);

      expect(i.flags()).to.equal(``);
    });
  });

  describe("openebs", () => {
    it("should parse", () => {
      const i = Installer.parse(openebs);

      expect(i.spec.openebs).to.deep.equal({
        version: "latest",
        isLocalPVEnabled: true,
        localPVStorageClassName: "default",
        isCstorEnabled: true,
        cstorStorageClassName: "cstor",
      });
    });
  });

  describe("latestMinors", () => {
    it("should include lateset version indexed by minor", () => {
      const out = Installer.latestMinors();

      expect(out[0]).to.equal("0.0.0");
      expect(out[14]).to.equal("0.0.0");
      expect(out[15]).to.equal("1.15.3");
      expect(out[16]).to.equal("1.16.4");
      expect(out[17]).to.equal("1.17.13");
      expect(out[18]).to.equal("1.18.10");
      expect(out[19]).to.equal("1.19.7");
    });
  });

  describe("collectd", () => {
    it("should parse", () => {
      const i = Installer.parse(everyOption);

      expect(i.spec.collectd.version).to.equal("v5");
    });
  });

  describe("certManager", () => {
    it("should parse the version", () => {
      const i = Installer.parse(everyOption);

      expect(i.spec.certManager.version).to.equal("1.0.3");
    });
  });

  describe("metricsServer", () => {
    it("should parse the version", () => {
      const i = Installer.parse(everyOption);

      expect(i.spec.metricsServer.version).to.equal("0.3.7");
    });
  });

  describe("helm", () => {
    it("should require helmfile", () => {
      const yaml = `
spec:
  kubernetes:
    version: latest
  helm:
    additionalImages:
    - postgres`;
      const i = Installer.parse(yaml);
      const out = i.validate();

      expect(out).to.deep.equal({ error: { message: "spec.helm should have required property 'helmfileSpec'" } });
    });
  });

  describe("packages", () => {
    it("should convert camel case to kebab case", () => {
      const i = Installer.parse(everyOption).resolve();
      const pkgs = i.packages();

      const hasCertManager = _.some(pkgs, (pkg) => {
        return _.startsWith(pkg, "cert-manager");
      });
      const hasMetricsServer = _.some(pkgs, (pkg) => {
        return _.startsWith(pkg, "metrics-server");
      });

      expect(hasCertManager).to.equal(true);
      expect(hasMetricsServer).to.equal(true);
    });

    it("should include defaults", () => {
      const i = Installer.parse(min);
      const pkgs = i.packages();

      const hasCommon = _.some(pkgs, (pkg) => {
        return pkg === "common";
      });
      expect(hasCommon).to.equal(true);

      const hasOpenssl = _.some(pkgs, (pkg) => {
        return pkg === "host-openssl";
      });
    });
  });

  describe("kurl.nameserver", () => {
    it("should parse the nameserver", () => {
      const i = Installer.parse(everyOption);

      expect(i.spec.kurl.nameserver).to.equal("8.8.8.8");
    });
  });
});
