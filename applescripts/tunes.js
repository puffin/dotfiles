let symbol = "♫";
let output = "";

if (Application("Music").running()) {
    const track = Application("Music").currentTrack;
    const artist = track.artist();
    const title = track.name();
    const status = Application("Music").playerState();
    if (status == "playing") {
        symbol = "▶︎";
    } else {
        symbol = "■";
    }
    output = ` ${symbol} ${title} - ${artist}`.substr(0, 50);
} else if (Application("Spotify").running()) {
    const track = Application("Spotify").currentTrack;
    const artist = track.artist();
    const title = track.name();
    const status = Application("Spotify").playerState();
    if (status == "playing") {
        symbol = "▶︎";
    } else {
        symbol = "■";
    }
    output = ` ${symbol} ${title} - ${artist}`.substr(0, 60);
}
output;
