#!/usr/bin/env bash

if test ! "$( command -v brew )"; then
    echo "Installing homebrew"
    ruby -e "$( curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install )"
fi

echo -e "\\n\\nInstalling homebrew packages..."
echo "=============================="

brew tap Yleisradio/terraforms

formulas=(
    bat
    diff-so-fancy
    dnsmasq
    fzf
    git
    git-lfs
    gnupg2
    highlight
    hub
    github/gh/gh
    ipython
    jq
    markdown
    neovim
    node
    python
    packer
    packer-completion
    pinentry
    pinentry-mac
    reattach-to-user-namespace
    the_silver_searcher
    shellcheck
    terraform
    tmux
    trash
    tree
    wget
    vim
    z
    zsh
    ripgrep
    entr
    zplug
    docker-completion
    awscli
    direnv
    ansible
    chtf
    pstree
    dive
    k6
    grip
    lnav
    coreutils
    gawk
    asdf
)

for formula in "${formulas[@]}"; do
    formula_name=$( echo "$formula" | awk '{print $1}' )
    if brew list "$formula_name" > /dev/null 2>&1; then
        echo "$formula_name already installed... skipping."
    else
        brew install "$formula"
    fi
done

# After the install, setup fzf
echo -e "\\n\\nRunning fzf install script..."
echo "=============================="
/usr/local/opt/fzf/install --all --no-bash --no-fish

# after the install, install neovim python libraries
echo -e "\\n\\nRunning Neovim Python install"
echo "=============================="
pip2 install --user neovim
pip3 install --user neovim

# after the install, install pytz python libraries
echo -e "\\n\\nRunning pytz Python install"
echo "=============================="
pip2 install --user pytz
pip3 install --user pytz

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
