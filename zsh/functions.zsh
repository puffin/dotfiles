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
  UIDLIST=$(/bin/ps -axo uid,args | \
           /usr/bin/grep '/Applications/Zscaler/Zscaler.app/Contents/MacOS/Zscaler' | \
           /usr/bin/grep -v grep | \
           /usr/bin/cut -f1 -d\/)

  for ZUID in $UIDLIST; do
     echo "Unload Zscaler from tray for UID $ZUID"
     /bin/launchctl asuser $ZUID /bin/launchctl unload /Library/LaunchAgents/com.zscaler.tray.plist
  done


  # Need to run pkill twice.  Once for /Applications/Zscaler/Zscaler.app/Contents/PlugIns/ZscalerTunnel and once for /Applications/Zscaler/Zscaler.app/Contents/PlugIns/ZscalerService and once for /Applications/Zscaler/Zscaler.app/Contents/MacOS/Zscaler
  sudo pkill Zscaler
  sudo pkill Zscaler

  echo "ZScaler is now disabled"
}

function zscaler-on () {
  sh /Applications/Zscaler/Zscaler.app/Contents/Resources/load_all_trays.sh
  echo "ZScaler is now enabled"
}
