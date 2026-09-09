#!/usr/bin/env bash

command_exists() {
    type "$1" > /dev/null 2>&1
}

echo "Installing dotfiles."

source install/link.sh

# only perform macOS-specific install
if [ "$(uname)" == "Darwin" ]; then
    echo -e "\\n\\nRunning on macOS"

    if test ! "$( command -v brew )"; then
        echo "Installing homebrew"
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi

    # Third-party taps must be explicitly trusted before brew will load
    # formulae from them (tmatilai/terraforms for chtf, oven-sh/bun for bun).
    brew trust tmatilai/terraforms 2>/dev/null || true
    brew trust oven-sh/bun 2>/dev/null || true

    # brew bundle installs everything that needs work in a single `brew install`
    # batch, so one unresolvable entry aborts the batch and every other package in
    # it is reported as failed. A renamed tap does exactly that: brew refuses a
    # formula whose install receipt names a different tap than the Brewfile asks
    # for (chtf moved yleisradio/terraforms -> tmatilai/terraforms). Drop those
    # kegs first so one rename can't take the whole run down.
    prune_retapped_formulae() {
        local cellar receipt want name have
        cellar="$( brew --cellar )"
        while read -r want name; do
            receipt="$( ls -1 "$cellar/$name"/*/INSTALL_RECEIPT.json 2>/dev/null | head -1 )"
            [ -n "$receipt" ] || continue
            have="$( grep -o '"tap": "[^"]*"' "$receipt" | head -1 | cut -d'"' -f4 )"
            [ -n "$have" ] && [ "$have" != "$want" ] || continue
            echo "$name was installed from $have, Brewfile wants $want - uninstalling"
            brew uninstall "$name" ||
                echo "could not uninstall $name - brew bundle may fail" >&2
        done < <( sed -n 's|^brew "\([^"/]*/[^"/]*\)/\([^"]*\)".*|\1 \2|p' Brewfile )
    }
    prune_retapped_formulae

    if ! brew bundle; then
        echo "brew bundle failed - see errors above. Continuing, but some tools may be missing." >&2
    fi

    # After the install, setup fzf
    fzf_install="$(brew --prefix)/opt/fzf/install"
    if [ -x "$fzf_install" ]; then
        echo -e "\\n\\nRunning fzf install script..."
        echo "=============================="
        "$fzf_install" --all --no-bash --no-fish
    fi

    if [ ! -d "$HOME/.tf-helper" ]; then
        echo -e "\\n\\nRunning terraform helper install"
        echo "=============================="
        git clone https://github.com/hashicorp-community/tf-helper.git ~/.tf-helper
    fi

    # Change the default shell to zsh
    zsh_path="$( command -v zsh )"
    if ! grep -qF "$zsh_path" /etc/shells; then
        echo "adding $zsh_path to /etc/shells"
        echo "$zsh_path" | sudo tee -a /etc/shells
    fi

    if [[ "$SHELL" != "$zsh_path" ]]; then
        chsh -s "$zsh_path"
        echo "default shell changed to $zsh_path"
    fi

    source install/osx.sh
fi

echo "creating vim directories"
mkdir -p ~/.vim-tmp

echo "creating ssh directories"
mkdir -p ~/.ssh

if ! command_exists zsh; then
    echo "zsh not found. Please install and then re-run installation scripts"
    exit 1
elif ! [[ $SHELL =~ .*zsh.* ]]; then
    echo "Configuring zsh as default shell"
    chsh -s "$(command -v zsh)"
fi

echo "creating gnupg configuration"
echo "=============================="
if [ ! -d "$HOME/.gnupg" ]; then
    echo "Creating ~/.gnupg"
    mkdir -m 0700 "$HOME/.gnupg"
    echo "Configuring gpg agent with pinentry"
    echo "pinentry-program $(brew --prefix)/bin/pinentry-mac" | tee "$HOME/.gnupg/gpg-agent.conf"
fi

# Install tmux-256color profile
/usr/bin/tic -xe alacritty-direct,tmux-256color resources/terminfo.src

if command_exists herdr; then
    echo -e "\\n\\nInstalling herdr plugins"
    echo "=============================="
    herdr_plugins=(
        kryptamine/herdr-auto-title
        paulbkim-dev/vim-herdr-navigation
        persiyanov/herdr-reviewr
        andrewchng/herdr-sessionizer
    )
    for plugin in "${herdr_plugins[@]}"; do
        herdr plugin install "$plugin" --yes || echo "Failed to install $plugin - see errors above. Continuing." >&2
    done

    # Claude Code integration: agent-state hook so herdr can track/restore
    # Claude panes (idle/working/blocked/done, resume on session restore).
    # Without it, restored panes come back as bare shells, not resumed agents.
    if command_exists claude; then
        herdr integration install claude || echo "Failed to install herdr claude integration - see errors above. Continuing." >&2
    fi
fi

echo "Done. Reload your terminal."
