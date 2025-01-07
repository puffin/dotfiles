####################
# functions
####################

function md() {
    mkdir -p $1
    cd $1
}

function help(){
    bash -c "help $@"
}

# get gzipped size
function gz() {
    echo "orig size    (bytes): "
    cat "$1" | wc -c
    echo "gzipped size (bytes): "
    gzip -c "$1" | wc -c
}

# All the dig info
function digga() {
    dig +nocmd "$1" any +multiline +noall +answer
}

# Escape UTF-8 characters into their 3-byte format
function escape() {
    printf "\\\x%s" $(printf "$@" | xxd -p -c1 -u)
    echo # newline
}

# Decode \x{ABCD}-style Unicode escape sequences
function unidecode() {
    perl -e "binmode(STDOUT, ':utf8'); print \"$@\""
    echo # newline
}

function zscaler-off () {
    launchctl list | awk '($3~"^com[.]zscaler[.]")' | while read pid sta label; do
        u=$(id -u)
        (set -x; launchctl bootout "gui/$u/$label")
    done
    l=$(sudo launchctl list)
    <<<"$l" awk '($3~"^com[.]zscaler[.]|com.jamfsoftware.task.Every*")' | while read pid sta label; do
        (set -x; sudo launchctl bootout "system/$label")
    done
    ## tunnel service takes longer to stop, so we check and wait up to 15 seconds
    if <<<"$l" grep "tunnel" >/dev/null; then
        printf "waiting for zscaler processes to stop"
        i=1 && while true; do
            if test -z "$(sudo launchctl list | awk '($3~"^com[.]zscaler[.]")')"; then
                echo
                break
            fi
            if test $((i++)) -gt 15; then
                printf "\nwarning: timed out waiting\n"
                break
            fi
            printf "."
            if test $((i % 4)) -eq 1; then
                printf "\b\b\b"
            fi
            sleep 1
        done
    fi
    echo "ZScaler is now disabled"
}

function zscaler-on () {
    l=$(sudo launchctl list)
    if test -z "$(<<<"$l" awk '($3=="com.zscaler.UPMServiceController")')"; then
        (set -x; sudo launchctl bootstrap system /Library/LaunchDaemons/com.zscaler.UPMServiceController.plist)
    fi
    if test -z "$(<<<"$l" awk '($3=="com.zscaler.service")')"; then
        (set -x; sudo launchctl bootstrap system /Library/LaunchDaemons/com.zscaler.service.plist)
    fi
    if test -z "$(<<<"$l" awk '($3=="com.zscaler.tunnel")')"; then
        (set -x; sudo launchctl bootstrap system /Library/LaunchDaemons/com.zscaler.tunnel.plist)
    fi
    if test -z "$(<<<"$l" awk '($3~"com.jamfsoftware.task.Every*")')"; then
        (set -x; sudo launchctl bootstrap system /Library/LaunchDaemons/com.jamfsoftware.task.1.plist)
    fi
    if test -z "$(launchctl list | awk '($3=="com.zscaler.tray")')"; then
        u=$(id -u)
        (set -x; launchctl bootstrap gui/$u /Library/LaunchAgents/com.zscaler.tray.plist)
    fi
    echo "ZScaler is now enabled"
}
