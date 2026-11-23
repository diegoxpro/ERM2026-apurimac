#!/usr/bin/env bash
# Prepara un Droplet Ubuntu 24.04 recién creado para correr ERM2026.
# Ejecutar UNA vez como root:
#   curl -fsSL https://raw.githubusercontent.com/diegoxpro/erm2026-apurimac/main/deploy/setup-droplet.sh | bash
# o, si ya clonaste el repo:  sudo bash deploy/setup-droplet.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Ejecuta este script como root (sudo)." >&2
  exit 1
fi

echo "==> Actualizando paquetes"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw unattended-upgrades

echo "==> Instalando Docker (repositorio oficial)"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "==> Swap de 2 GB (el build de Vite puede quedarse sin memoria en Droplets chicos)"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
fi

echo "==> Firewall: solo SSH, HTTP y HTTPS"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Actualizaciones de seguridad automáticas"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo
echo "Listo. Docker $(docker --version | awk '{print $3}' | tr -d ,) y $(docker compose version --short) instalados."
echo "Siguiente paso: clonar el repo en /opt/erm2026 y seguir docs/DESPLIEGUE-DIGITALOCEAN.md"
