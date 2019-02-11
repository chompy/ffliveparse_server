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

/**
 * Web socket.
 */
var socket;

/**
 * Encounter UID
 */
var encounterUid = "";

/**
 * Listen for message containing web socket url.
 */
self.addEventListener("message", function(e) {
    encounterUid = e.data.encounterUid;
    var fileReader = new FileReader();
    fileReader.onload = function(e) {
        var buffer = new Uint8Array(e.target.result);
        try {
            parseMessage(buffer);
        } catch (e) {
            console.log(">> Error parsing message,", buf2hex(buffer));
            throw e
        }
    };
    fileReader.readAsArrayBuffer(e.data.data); 
});