setopt NO_BG_NICE
setopt NO_HUP
setopt NO_LIST_BEEP
setopt LOCAL_OPTIONS
setopt LOCAL_TRAPS
#setopt IGNORE_EOF
setopt PROMPT_SUBST

HISTFILE=~/.zsh_history
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
