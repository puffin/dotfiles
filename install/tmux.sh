#!/usr/bin/env bash

if [ -e "$HOME/.tmux/plugins/tpm" ]; then
    echo "$HOME/.tmux/plugins/tpm already exists... Skipping."
else
    echo "Installing tmux plugin manager"
    git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm 
fi
