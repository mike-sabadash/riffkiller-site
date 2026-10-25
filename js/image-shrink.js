// The server takes at most 2 MB per upload (php upload_max_filesize). A cover photo straight from a phone or a
// design tool is often bigger: re-encode it in the browser as a JPEG no wider than the site ever shows it.
(function () {
    var MAX_BYTES = 1.8 * 1024 * 1024;
    function load(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file), img = new Image();
            img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Не получилось прочитать картинку.')); };
            img.src = url;
        });
    }
    function encode(img, width, quality) {
        var canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = Math.round(img.naturalHeight * width / img.naturalWidth);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', quality); });
    }
    // Resolves with the file itself when it already fits, else with a smaller JPEG blob.
    window.shrinkImage = function (file, maxWidth) {
        maxWidth = maxWidth || 2400;
        return load(file).then(function (img) {
            if (file.size <= MAX_BYTES && img.naturalWidth <= maxWidth) return file;
            var width = Math.min(maxWidth, img.naturalWidth), quality = 0.88;
            function attempt() {
                return encode(img, width, quality).then(function (blob) {
                    if (!blob) throw new Error('Не получилось сжать картинку.');
                    if (blob.size <= MAX_BYTES || width < 600) return blob;
                    if (quality > 0.7) quality -= 0.08; else width = Math.round(width * 0.8);
                    return attempt();
                });
            }
            return attempt();
        });
    };
})();
