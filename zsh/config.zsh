setopt NO_BG_NICE
setopt NO_HUP
setopt NO_LIST_BEEP
setopt LOCAL_OPTIONS
setopt LOCAL_TRAPS
#setopt IGNORE_EOF
setopt PROMPT_SUBST

# icloud location to share between devices
HISTFILE=~/Documents/.zsh_history
HISTSIZE=10000
SAVEHIST=10000

# history
setopt HIST_VERIFY
setopt EXTENDED_HISTORY
setopt HIST_REDUCE_BLANKS
setopt SHARE_HISTORY
setopt HIST_IGNORE_ALL_DUPS

setopt COMPLETE_ALIASES

# make terminal command navigation sane again
bindkey '^[f' forward-word              # ALT + arrow right
bindkey '^[b' backward-word             # ALT + arrow left
bindkey '^[[1~' beginning-of-line       # CMD + arrow left
bindkey '^[[4~' end-of-line             # CMD + arrow right
bindkey '^[[1;3B' delete-char           # ALT + arrow down
bindkey '^[[1;3A' backward-delete-char  # ALT + arrow up
bindkey '^[^?' backward-kill-word       # ALT + BACKSPACE
bindkey '^[d' kill-word                 # ALT + D

# Theme toggle (CTRL+X CTRL+T)
toggle-theme-widget() { toggle-theme; zle reset-prompt; }
zle -N toggle-theme-widget
bindkey '^x^t' toggle-theme-widget

# Claude Code mods: load every plugin under config/claude-mods in each session.
# (N) drops the glob when the folder is empty; ${(j/:/)} joins with ':'.
claude_mods=( $HOME/.dotfiles/config/claude-mods/*/.claude-plugin(N:h) )
(( ${#claude_mods} )) && export CLAUDE_CODE_PLUGIN_DIRS=${(j/:/)claude_mods}
unset claude_mods
