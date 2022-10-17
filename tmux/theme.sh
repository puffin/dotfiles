# Base16 Styling Guidelines:

base00=default   # - Default
base01='#151515' # - Lighter Background (Used for status bars)
base02='#202020' # - Selection Background
base03='#ABB2BF' # - Comments, Invisibles, Line Highlighting
base04='#505050' # - Dark Foreground (Used for status bars)
base05='#D0D0D0' # - Default Foreground, Caret, Delimiters, Operators
base06='#E0E0E0' # - Light Foreground (Not often used)
base07='#F5F5F5' # - Light Background (Not often used)
base08='#AC4142' # - Variables, XML Tags, Markup Link Text, Markup Lists, Diff Deleted
base09='#D28445' # - Integers, Boolean, Constants, XML Attributes, Markup Link Url
base0A='#F4BF75' # - Classes, Markup Bold, Search Text Background
base0B='#90A959' # - Strings, Inherited Class, Markup Code, Diff Inserted
base0C='#56B6C2' # - Support, Regular Expressions, Escape Characters, Markup Quotes
base0D='#6A9FB5' # - Functions, Methods, Attribute IDs, Headings
base0E='#C678DD' # - Keywords, Storage, Selector, Markup Italic, Diff Changed
base0F='#8F5536' # - Deprecated, Opening/Closing Embedded Language Tags, e.g. <? php ?>

set -g status-left-length 32
set -g status-right-length 150
set -g status-interval 5

# selection color
set -g mode-style bg=$base00,fg=$base07

# default statusbar colors
set-option -g status-style fg=$base02,bg=$base00

set-window-option -g window-status-style fg=$base03,bg=$base00
set -g window-status-format "#I #W "

# active window title colors
set-window-option -g window-status-current-style fg=$base0C,bg=$base00
set-window-option -g window-status-current-format "#[bold]#I #W "

# pane border colors
set-window-option -g pane-border-style fg=$base03
set-window-option -g pane-active-border-style fg=$base0C

# message text
set-option -g message-style bg=$base00,fg=$base0C

# pane number display
set-option -g display-panes-active-colour $base0C
set-option -g display-panes-colour $base01

# clock
set-window-option -g clock-mode-colour $base0C

tm_session_name="#[default,bg=$base00,fg=$base0E] #S "
tm_battery="#[fg=$base0F,bg=$base00] ♥ #(battery)"
tm_vpn=" #(~/.dotfiles/bin/vpn_indicator.sh)"
tm_date="#[default,bg=$base00,fg=$base0C] %R"
tm_wclock="#[bg=$base00,fg=$base03] #{world_clock_status}"
tm_tunes="#[default,bg=$base00,fg=$base0B] #(osascript -l JavaScript $DOTFILES/applescripts/tunes.js)"

set -g status-left "$tm_session_name"
#set -g status-right "$tm_tunes$tm_wclock$tm_vpn $tm_battery $tm_date"
set -g status-right ""
