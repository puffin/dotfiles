#!/usr/bin/env bash

DOTFILES=$HOME/.dotfiles

echo -e "\\nCreating symlinks"
echo "=============================="
linkables=$( find -H "$DOTFILES" -maxdepth 3 -name '*.symlink' )
for file in $linkables ; do
    target="$HOME/.$( basename "$file" '.symlink' )"
    if [ -e "$target" ]; then
        echo "~${target#$HOME} already exists... Skipping."
    else
        echo "Creating symlink for $file"
        ln -s "$file" "$target"
    fi
done

echo -e "\\n\\ninstalling to ~/.config"
echo "=============================="
if [ ! -d "$HOME/.config" ]; then
    echo "Creating ~/.config"
    mkdir -p "$HOME/.config"
fi

config_files=$( find "$DOTFILES/config" -d 1 2>/dev/null )
for config in $config_files; do
    target="$HOME/.config/$( basename "$config" )"
    if [ -e "$target" ]; then
        echo "~${target#$HOME} already exists... Skipping."
    else
        echo "Creating symlink for $config"
        ln -s "$config" "$target"
    fi
done

echo -e "\\n\\ninstalling to ~/.claude/hooks"
echo "=============================="
mkdir -p "$HOME/.claude/hooks"
claude_hooks=$( find "$DOTFILES/config/claude-hooks" -maxdepth 1 -type f 2>/dev/null )
for hook in $claude_hooks; do
    target="$HOME/.claude/hooks/$( basename "$hook" )"
    if [ -e "$target" ]; then
        echo "~${target#$HOME} already exists... Skipping."
    else
        echo "Creating symlink for $hook"
        ln -s "$hook" "$target"
    fi
done

echo -e "\\n\\nseeding generated theme state"
echo "=============================="
# bin/toggle-theme writes these and they're gitignored, so a fresh clone has
# none. Alacritty skips missing imports and tmux.conf sources with -q, so this
# only decides the starting theme rather than preventing a breakage.
if [ ! -e "$DOTFILES/config/alacritty/theme-current.toml" ]; then
    echo "Creating config/alacritty/theme-current.toml (one-dark)"
    cp "$DOTFILES/config/alacritty/themes/one-dark.toml" "$DOTFILES/config/alacritty/theme-current.toml"
fi
if [ ! -e "$DOTFILES/tmux/theme-current.sh" ]; then
    echo "Creating tmux/theme-current.sh (one-dark)"
    cp "$DOTFILES/tmux/theme-dark.sh" "$DOTFILES/tmux/theme-current.sh"
fi
