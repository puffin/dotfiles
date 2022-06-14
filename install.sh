#!/usr/bin/env bash

command_exists() {
    type "$1" > /dev/null 2>&1
}

echo "Installing dotfiles."

echo "Initializing submodule(s)"
git submodule add git@github.com:chriskempson/base16-shell.git config/base16-shell
git submodule update --init --recursive

source install/link.sh

# only perform macOS-specific install
if [ "$(uname)" == "Darwin" ]; then
    echo -e "\\n\\nRunning on macOS"

    if test ! "$( command -v brew )"; then
        echo "Installing homebrew"
        ruby -e "$( curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install )"
    fi

    brew bundle

    # After the install, setup fzf
    echo -e "\\n\\nRunning fzf install script..."
    echo "=============================="
    $(brew --prefix)/opt/fzf/install --all --no-bash --no-fish

    # after the install, install neovim python libraries
    echo -e "\\n\\nRunning Neovim Python install"
    echo "=============================="
    pip3 install --user neovim
    pip3 install --user pynvim

    # after the install, install pytz python libraries
    echo -e "\\n\\nRunning pytz Python install"
    echo "=============================="
    pip3 install --user pytz

    # after the install, install jedi python libraries
    echo -e "\\n\\nRunning jedi Python install"
    echo "=============================="
    pip3 install --user jedi

    # after the install, install ranger
    echo -e "\\n\\nRunning ranger Python install"
    echo "=============================="
    pip3 install --user ranger-fm


    # after the install, install perl neovim extension
    echo -e "\\n\\nRunning perl neovim extension install"
    echo "=============================="
    cpanm -n Neovim::Ext

    if [ ! -d "$HOME/.elixir-ls" ]; then
        echo -e "\\n\\nRunning elixir LS install"
        echo "=============================="
        git clone https://github.com/elixir-lsp/elixir-ls.git ~/.elixir-ls && \
        cd ~/.elixir-ls && \
        mix deps.get && mix compile && mix elixir_ls.release -o release
    fi

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
    echo "pinentry-program /usr/local/bin/pinentry-mac" | tee "$HOME/.gnupg/gpg-agent.conf"
fi

echo "installing ruby management tool"
echo "=============================="
gpg --keyserver hkp://pool.sks-keyservers.net --recv-keys 409B6B1796C275462A1703113804BB82D39DC0E3 7D2BAF1CF37B13E2069D6956105BD0E739499BDB
curl -sSL https://get.rvm.io | bash
source "$HOME/.zshrc"
curl -sSL https://cache.ruby-lang.org/pub/ruby/2.7/ruby-2.7.5.tar.bz2 -o ~/.rvm/archives/ruby-2.7.5.tar.bz2
rvm install ruby-2.7.5
rvm alias create default 2.7.5
rvm use ruby-2.7.5

# after the install, install solargraph ruby libraries
echo -e "\\n\\nRunning solargraph Ruby install"
echo "=============================="
gem install solargraph

# install graphql lsp
echo -e "\\n\\nRunning graphql lsp install"
echo "=============================="
npm i -g graphql-language-service-cli

# install graphql lsp
echo -e "\\n\\nRunning bash lsp install"
echo "=============================="
npm i -g bash-language-server

# Install tmux-256color profile
/usr/bin/tic -xe alacritty-direct,tmux-256color resources/terminfo.src

echo "Done. Reload your terminal."
