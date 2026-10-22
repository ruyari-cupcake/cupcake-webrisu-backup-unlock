# Sourced by the scale scripts: sets CAP=(...) to a memory+time cap for GB-scale browser runs.
# Non-login shells lack the user-bus variables `systemd-run --user` needs, so supply them; if
# the cap still cannot be applied, say so loudly instead of silently running with a time cap only.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
CAP_MEMORY="${CAP_MEMORY:-8G}"
CAP_SECONDS="${CAP_SECONDS:-900}"
if systemd-run --user --scope --quiet -p MemoryMax="$CAP_MEMORY" true 2>/dev/null; then
  CAP=(systemd-run --user --scope --quiet -p MemoryMax="$CAP_MEMORY" timeout "$CAP_SECONDS")
  echo "cap: MemoryMax=$CAP_MEMORY, ${CAP_SECONDS}s"
else
  CAP=(timeout "$CAP_SECONDS")
  echo "WARNING: memory cap unavailable (systemd-run --user failed); time cap ${CAP_SECONDS}s only" >&2
fi
