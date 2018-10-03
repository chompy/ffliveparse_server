/*
This file is part of FFLiveParse.

FFLiveParse is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

FFLiveParse is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with FFLiveParse.  If not, see <https://www.gnu.org/licenses/>.
*/

// init main app
var application = new Application(WEB_ID, ENCOUNTER_ID);
window.addEventListener("load", function(e) {
    application.connect();
});

// load textdecoder polyfill
if (typeof(window["TextDecoder"]) == "undefined") {
    var bodyElement = document.getElementsByTagName("body")[0];
    var textEncoderPolyfills = [
        "https://unpkg.com/text-encoding@0.6.4/lib/encoding-indexes.js",
        "https://unpkg.com/text-encoding@0.6.4/lib/encoding.js"
    ];
    for (var i = 0; i < textEncoderPolyfills.length; i++) {
        var scriptElement = document.createElement("script");
        scriptElement.src = textEncoderPolyfills[i];
        bodyElement.appendChild(scriptElement);
    }
}

