#!/usr/bin/env bash

command_exists() {
    type "$1" > /dev/null 2>&1
}

DOTFILES=$HOME/.dotfiles

if [ ! -f "Brewfile" ] || [ ! -d "install" ]; then
    echo "Run this from the root of the dotfiles repo (cd ~/.dotfiles && ./uninstall.sh)."
    exit 1
fi

cat <<'EOF'
This will undo what install.sh set up:
  - Remove symlinks it created (only ones still pointing at this repo)
  - Revert the default shell, if install.sh changed it
  - Uninstall the Homebrew packages/casks/taps listed in the Brewfile
  - Remove zinit, fzf's shell integration file, tf-helper, nvim's
    lazy.nvim/mason data, and tmux's plugin manager
  - Delete the specific macOS `defaults` keys install/osx.sh set (falling
    back to macOS's own defaults - your previous values were never
    recorded, so they can't be restored, only cleared)

It will NOT touch: ~/.ssh, ~/.gnupg (besides gpg-agent.conf), ~/.vim-tmp,
nvim's shada/undo history, or tmux-resurrect's saved session snapshots -
those may hold data of your own, not just what install.sh put there.

Note: claude-code is itself a Brewfile cask, so it will be uninstalled too.
EOF
echo
read -r -p "Continue? [y/N] " confirm
if [[ "$confirm" != [yY] ]]; then
    echo "Aborted."
    exit 0
fi

echo -e "\\n\\nRemoving symlinks"
echo "=============================="
linkables=$( find -H "$DOTFILES" -maxdepth 3 -name '*.symlink' )
for file in $linkables; do
    target="$HOME/.$( basename "$file" '.symlink' )"
    if [ -L "$target" ] && [ "$( readlink "$target" )" = "$file" ]; then
        echo "Removing ~${target#$HOME}"
        rm "$target"
    else
        echo "~${target#$HOME} isn't a symlink to this repo... Skipping."
    fi
done

config_dirs=$( find "$DOTFILES/config" -d 1 2>/dev/null )
for config in $config_dirs; do
    target="$HOME/.config/$( basename "$config" )"
    if [ -L "$target" ] && [ "$( readlink "$target" )" = "$config" ]; then
        echo "Removing ~${target#$HOME}"
        rm "$target"
    else
        echo "~${target#$HOME} isn't a symlink to this repo... Skipping."
    fi
done

if [ "$(uname)" == "Darwin" ]; then
    echo -e "\\n\\nReverting default shell"
    echo "=============================="
    if [[ "$SHELL" == /opt/homebrew/*/zsh || "$SHELL" == /usr/local/*/zsh ]]; then
        chsh -s /bin/zsh
        echo "default shell reverted to /bin/zsh"
    else
        echo "Shell wasn't changed by install.sh (currently $SHELL)... Skipping."
    fi

    if command_exists brew; then
        echo -e "\\n\\nUninstalling Brewfile packages"
        echo "=============================="
        grep -E '^brew "' Brewfile | sed -E 's/^brew "([^"]+)".*/\1/' | while read -r name; do
            brew uninstall --formula --ignore-dependencies "$name"
        done
        grep -E '^cask "' Brewfile | sed -E 's/^cask "([^"]+)".*/\1/' | while read -r name; do
            brew uninstall --cask --ignore-dependencies "$name"
        done

        echo -e "\\n\\nRemoving now-unused dependencies"
        echo "=============================="
        brew autoremove

        echo -e "\\n\\nUntapping Brewfile taps"
        echo "=============================="
        grep -E '^tap "' Brewfile | sed -E 's/^tap "([^"]+)".*/\1/' | while read -r name; do
            brew untap "$name"
        done
    fi

    echo -e "\\n\\nReverting macOS settings"
    echo "=============================="
    defaults delete NSGlobalDomain AppleShowAllExtensions 2>/dev/null
    defaults delete com.apple.finder AppleShowAllFiles 2>/dev/null
    defaults delete com.apple.terminal StringEncodings 2>/dev/null
    defaults delete NSGlobalDomain NSNavPanelExpandedStateForSaveMode 2>/dev/null
    chflags hidden ~/Library
    defaults delete NSGlobalDomain AppleKeyboardUIMode 2>/dev/null
    defaults delete NSGlobalDomain AppleFontSmoothing 2>/dev/null
    defaults delete com.apple.finder FXDefaultSearchScope 2>/dev/null
    defaults delete com.apple.finder ShowPathbar 2>/dev/null
    defaults delete com.apple.finder ShowStatusBar 2>/dev/null
    defaults delete NSGlobalDomain ApplePressAndHoldEnabled 2>/dev/null
    defaults delete NSGlobalDomain KeyRepeat 2>/dev/null
    defaults delete NSGlobalDomain InitialKeyRepeat 2>/dev/null
    defaults delete com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking 2>/dev/null
    defaults delete com.apple.Safari IncludeInternalDebugMenu 2>/dev/null
    for app in Safari Finder Dock Mail SystemUIServer; do killall "$app" >/dev/null 2>&1; done
fi

echo -e "\\n\\nRemoving caches and clones"
echo "=============================="
rm -rf "$HOME/.local/share/zinit"
rm -f  "$HOME/.fzf.zsh"
rm -rf "$HOME/.tf-helper"
rm -rf "$HOME/.local/share/nvim"
rm -rf "$HOME/.tmux/plugins"
rm -f  "$HOME/.gnupg/gpg-agent.conf"

cat <<'EOF'


Done. Left untouched (may hold data of your own):
  ~/.ssh
  ~/.gnupg (besides gpg-agent.conf)
  ~/.vim-tmp
  ~/.local/state/nvim (shada/undo history)
  ~/.local/share/tmux/resurrect (saved tmux sessions)
EOF
