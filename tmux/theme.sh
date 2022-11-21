## COLORSCHEME: gruvbox light

set-option -g status "on"

# default statusbar colors
set-option -g status-style bg=default,fg=colour239

# default window title colors
set-window-option -g window-status-style bg=default,fg=colour229

# default window with an activity alert
set-window-option -g window-status-activity-style bg=default,fg=colour241

# active window title colors
set-window-option -g window-status-current-style bg=default,fg=colour237

# pane border
set-option -g pane-active-border-style fg=colour241
set-option -g pane-border-style fg=colour252

# message infos (visible while writing command)
set-option -g message-style bg=default,fg=colour241

# writing commands inactive
set-option -g message-command-style bg=default,fg=colour124

# pane number display
set-option -g display-panes-active-colour colour241
set-option -g display-panes-colour colour248

# clock
set-window-option -g clock-mode-colour colour172

# bell
set-window-option -g window-status-bell-style bg=colour124,fg=colour229

set-option -g status-justify "left"
set-option -g status-left-style none
set-option -g status-left-length "80"
set-option -g status-right-style none
set-option -g status-right-length "80"
set-window-option -g window-status-separator ""

set-option -g status-left "#[bg=default,fg=colour66] #S "
set-option -g status-right ""

set-window-option -g window-status-current-format "#[bg=default,fg=colour132,bold] #I #W "
set-window-option -g window-status-format "#[bg=default,fg=colour243] #I #W "
