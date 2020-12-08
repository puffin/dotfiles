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
    /usr/local/opt/fzf/install --all --no-bash --no-fish

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

    # after the install, install solaegraph ruby libraries
    echo -e "\\n\\nRunning solargraph Ruby install"
    echo "=============================="
    gem install solargraph

    if [ ! -d "$HOME/.elixir-ls" ]; then
        echo -e "\\n\\nRunning elixir LS install"
        echo "=============================="
        git clone https://github.com/elixir-lsp/elixir-ls.git ~/.elixir-ls && \
        cd ~/.elixir-ls && \
        mix deps.get && mix compile && mix elixir_ls.release -o release
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


echo "Done. Reload your terminal."
