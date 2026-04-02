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

    brew bundle

    # After the install, setup fzf
    echo -e "\\n\\nRunning fzf install script..."
    echo "=============================="
    $(brew --prefix)/opt/fzf/install --all --no-bash --no-fish

    if [ ! -d "$HOME/.tf-helper" ]; then
        echo -e "\\n\\nRunning terraform helper install"
        echo "=============================="
        git clone git@github.com:hashicorp-community/tf-helper.git ~/.tf-helper
    fi

    # Change the default shell to zsh
    zsh_path="$( command -v zsh )"
    if ! grep "$zsh_path" /etc/shells; then
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

echo "Done. Reload your terminal."
