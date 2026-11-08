#!/usr/bin/env bash
# Create the service user, API key, environment file, and systemd unit for the vision reader.
# Usage: sudo ./deploy/orin/configure-service.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_DIR=/etc/label-lens-vision

if ! id labellens >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin labellens
fi
# Jetson GPU access is granted through the video and render groups.
for GROUP in video render; do
  if getent group "${GROUP}" >/dev/null; then usermod -aG "${GROUP}" labellens; fi
done

install -d -m 750 -o root -g labellens "${CONF_DIR}"

if [[ ! -s "${CONF_DIR}/api-key" ]]; then
  umask 077
  head -c 32 /dev/urandom | base64 | tr -d '/+=\n' > "${CONF_DIR}/api-key"
  chown root:labellens "${CONF_DIR}/api-key"
  chmod 640 "${CONF_DIR}/api-key"
  echo "Generated ${CONF_DIR}/api-key"
fi

if [[ ! -f "${CONF_DIR}/vision.env" ]]; then
  install -m 640 -o root -g labellens "${HERE}/vision.env.example" "${CONF_DIR}/vision.env"
  echo "Wrote ${CONF_DIR}/vision.env — edit the bind address and model paths before starting."
fi

install -m 644 "${HERE}/label-lens-vision.service" /etc/systemd/system/label-lens-vision.service
systemctl daemon-reload

echo
echo "Next:"
echo "  sudoedit ${CONF_DIR}/vision.env"
echo "  sudo systemctl enable --now label-lens-vision"
echo "  sudo cat ${CONF_DIR}/api-key   # copy into LABEL_LENS_VISION_API_KEY on the Label Lens host"
