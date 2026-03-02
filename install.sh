#!/bin/bash
set -e

# Universal Scraper Installer
# One-liner: curl -sL https://raw.githubusercontent.com/creesbot9-dot/universal-scraper/master/install.sh | bash

INSTALL_DIR="$HOME/.local/share/universal-scraper"
BIN_DIR="$HOME/.local/bin"
COMMAND_NAME="scrape"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

detect_os() {
    case "$(uname -s)" in
        Linux*)     echo "linux";;
        Darwin*)    echo "macos";;
        *)          echo "unknown";;
    esac
}

detect_arch() {
    case "$(uname -m)" in
        x86_64)     echo "x64";;
        aarch64|arm64)  echo "arm64";;
        *)          echo "unknown";;
    esac
}

add_to_path() {
    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        echo "export PATH=\"\$PATH:$BIN_DIR\"" >> "$HOME/.bashrc"
        export PATH="$PATH:$BIN_DIR"
        log_info "Added $BIN_DIR to PATH in ~/.bashrc"
    fi
}

main() {
    log_info "Installing Universal Scraper..."
    
    local os=$(detect_os)
    local arch=$(detect_arch)
    
    log_info "Detected: $os ($arch)"
    
    if [[ "$os" == "unknown" ]]; then
        log_error "Unsupported OS. Only Linux and macOS are supported."
        exit 1
    fi
    
    # Create directories
    log_info "Creating installation directory..."
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$BIN_DIR"
    
    # Clone or download repo
    log_info "Downloading Universal Scraper..."
    if command -v git &> /dev/null; then
        if [[ -d "$INSTALL_DIR/.git" ]]; then
            cd "$INSTALL_DIR" && git pull --quiet
            log_info "Updated existing installation"
        else
            rm -rf "$INSTALL_DIR"
            git clone --quiet https://github.com/creesbot9-dot/universal-scraper.git "$INSTALL_DIR"
            log_info "Cloned fresh copy"
        fi
    else
        log_error "Git is required but not installed. Please install git and try again."
        exit 1
    fi
    
    # Install dependencies
    log_info "Installing Node.js dependencies..."
    cd "$INSTALL_DIR"
    npm install --silent 2>/dev/null || npm install
    
    log_info "Installing Playwright browser..."
    npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium
    
    # Create wrapper script - FIX: use actual install dir
    log_info "Creating command wrapper..."
    cat > "$BIN_DIR/$COMMAND_NAME" << 'EOF'
#!/bin/bash
# Universal Scraper wrapper
INSTALL_DIR="$HOME/.local/share/universal-scraper"
cd "$INSTALL_DIR" && node scraper.js "$@"
EOF
    
    chmod +x "$BIN_DIR/$COMMAND_NAME"
    
    # Add to PATH
    add_to_path
    
    # Register as OpenClaw skill
    log_info "Registering as OpenClaw skill..."
    SKILL_DIR="$HOME/.npm-global/lib/node_modules/openclaw/skills/universal-scraper"
    mkdir -p "$SKILL_DIR"
    cp "$INSTALL_DIR/SKILL.md" "$SKILL_DIR/"
    log_info "Registered universal-scraper skill"
    
    log_info ""
    log_info "Installation complete!"
    log_info ""
    log_info "Usage: $COMMAND_NAME <url> [options]"
    log_info "Example: $COMMAND_NAME https://example.com"
    log_info ""
    log_info "To use in OpenClaw/Telegram, restart gateway:"
    log_info "  openclaw gateway restart"
    log_info ""
    log_info "Then say: Scrape https://example.com"
}

main "$@"
