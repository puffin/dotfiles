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

function rdenv() {
    if [ $1 ] ; then
        case $1 in
            tool)
              export DOCKER_CERT_PATH=~/.docker/hl_swarm_tool/;
              export DOCKER_TLS_VERIFY=1;
              export DOCKER_HOST=docker-socket-tool.hatched.kitchen:2376;
              echo "'$1' docker remote environment set"
            ;;
            prod)
              export DOCKER_CERT_PATH=~/.docker/hl_swarm_prod/;
              export DOCKER_TLS_VERIFY=1;
              export DOCKER_HOST=docker-socket-prod-shared.prod.hatched.kitchen:2376;
              echo "'$1' docker remote environment set"
            ;;
            staging)
              export DOCKER_CERT_PATH=~/.docker/hl_swarm_staging/;
              export DOCKER_TLS_VERIFY=1;
              export DOCKER_HOST=docker-socket-staging-shared.staging.hatched.kitchen:2376;
              echo "'$1' docker remote environment set"
            ;;
            *)
              echo "'$1' unrecognised docker remote environment"
            ;;
        esac
    else
        echo "missing docker remote environment"
    fi
}
