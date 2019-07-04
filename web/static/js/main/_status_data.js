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

var STATUS_DATA_BASE_URL = "https://ffxivactions.s3.amazonaws.com/status_effects";
var STATUS_DATA_JSON = "/status_effects.json";
var _statusData = null;

/**
 * Get information about status effects.
 */
class StatusData
{

    constructor(statusData)
    {
        this.statusData = statusData;
        this.statusDataNameCache = {};
    }

    /**
     * Get status data by its name.
     * @param {string} name 
     * @return {dict|null}
     */
    getStatusByName(name)
    {
        var name = name.toLowerCase();
        // check name cache for index
        if (name in this.statusDataNameCache) {
            return this.statusData[this.statusDataNameCache[name]];
        }
        // itterate statuss to find one with matching name
        for (var index in this.statusData) {
            if (this.statusData[index]["name"].toLowerCase() == name) {
                this.statusDataNameCache[name] = index;
                return this.statusData[index];
            }
        }
        return null;
    }

}

/**
 * Fetch status data from remote server and trigger 'status-data-ready' event when done.
 */
function fetchStatusData()
{
    var request = new XMLHttpRequest();
    request.open("GET", STATUS_DATA_BASE_URL + STATUS_DATA_JSON + "?v=2", true);
    request.send();
    request.addEventListener("load", function(e) {
        console.log(">> Status data fetched.");
        var data = JSON.parse(request.response);
        if (data) {
            _statusData = new StatusData(data);
            window.dispatchEvent(
                new CustomEvent("app:status-data", {"detail" : _statusData})
            );
        }
    });
    request.addEventListener("error", function(e) {
        throw e;
    });
    request.addEventListener("abort", function(e) {
        throw e;
    });
}