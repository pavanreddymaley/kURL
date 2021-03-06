
function containerd_install() {
    local src="$DIR/addons/containerd/$CONTAINERD_VERSION"

    if [ "$SKIP_CONTAINERD_INSTALL" != "1" ]; then
        install_host_archives "$src"
        install_host_packages "$src"
        containerd_configure
    fi

    systemctl enable containerd

    containerd_configure_ctl "$src"

    # NOTE: this will not remove the proxy
    if [ -n "$PROXY_ADDRESS" ]; then
        containerd_configure_proxy
    fi

    if commandExists registry_containerd_configure && [ -n "$DOCKER_REGISTRY_IP" ]; then
        registry_containerd_configure "$DOCKER_REGISTRY_IP"
        if [ "$REGISTRY_CONTAINERD_CA_ADDED" = "1" ]; then
            restart_containerd
        fi
    fi

    load_images $src/images
}

function containerd_configure() {
    mkdir -p /etc/containerd
    containerd config default > /etc/containerd/config.toml

    sed -i '/systemd_cgroup/d' /etc/containerd/config.toml
    sed -i '/containerd.runtimes.runc.options/d' /etc/containerd/config.toml
    cat >> /etc/containerd/config.toml <<EOF
[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc.options]
  SystemdCgroup = true
EOF

    # Always set for joining nodes since it's passed as a flag in the generated join script, but not
    # usually set for the initial install. For initial installs the registry will be configured from
    # registry_containerd_init.
    if commandExists registry_containerd_configure && [ -n "$DOCKER_REGISTRY_IP" ]; then
        registry_containerd_configure "$DOCKER_REGISTRY_IP"
    fi
    systemctl restart containerd
}

function containerd_configure_ctl() {
    local src="$1"

    if [ -e "/etc/crictl.yaml" ]; then
        return 0
    fi

    cp "$src/crictl.yaml" /etc/crictl.yaml
}

containerd_configure_proxy() {
    local previous_proxy="$(cat /etc/systemd/system/containerd.service.d/http-proxy.conf 2>/dev/null | grep -io 'https*_proxy=[^\" ]*' | awk 'BEGIN { FS="=" }; { print $2 }')"
    local previous_no_proxy="$(cat /etc/systemd/system/containerd.service.d/http-proxy.conf 2>/dev/null | grep -io 'no_proxy=[^\" ]*' | awk 'BEGIN { FS="=" }; { print $2 }')"
    if [ "$PROXY_ADDRESS" = "$previous_proxy" ] && [ "$NO_PROXY_ADDRESSES" = "$previous_no_proxy" ]; then
        return
    fi

    mkdir -p /etc/systemd/system/containerd.service.d
    local file=/etc/systemd/system/containerd.service.d/http-proxy.conf

    echo "# Generated by kURL" > $file
    echo "[Service]" >> $file

    if echo "$PROXY_ADDRESS" | grep -q "^https"; then
        echo "Environment=\"HTTPS_PROXY=${PROXY_ADDRESS}\" \"NO_PROXY=${NO_PROXY_ADDRESSES}\"" >> $file
    else
        echo "Environment=\"HTTP_PROXY=${PROXY_ADDRESS}\" \"NO_PROXY=${NO_PROXY_ADDRESSES}\"" >> $file
    fi

    restart_containerd
}

function restart_containerd() {
    systemctl daemon-reload
    systemctl restart containerd
}
