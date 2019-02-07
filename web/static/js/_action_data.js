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

var ACTION_DATA_BASE_URL = "https://ffxivactions.s3.amazonaws.com";
var ACTION_DATA_JSON = "/actions.json";
var _actionData = null;

/**
 * Get information about skills/actions.
 */
class ActionData
{

    constructor(actionData)
    {
        this.actionData = actionData;
        this.actionDataNameCache = {};
    }

    /**
     * Get action data by its id.
     * @param {int} actionId 
     * @return {dict|null}
     */
    getActionById(actionId)
    {
        if (!(actionId in this.actionData)) {
            return null;
        }
        var data = this.actionData[actionId];
        data["id"] = actionId;
        data["name"] = data["name_en"];
        data["description"] = data["help_en"];
        return data;
    }

    /**
     * Get action data by its name.
     * @param {string} name 
     * @return {dict|null}
     */
    getActionByName(name)
    {
        var name = name.toLowerCase();
        // check name cache for index
        if (name in this.actionDataNameCache) {
            return this.actionData[this.actionDataNameCache[name]];
        }
        // itterate actions to find one with matching name
        for (var actionId in this.actionData) {
            if (this.actionData[actionId]["name_en"].toLowerCase() == name) {
                this.actionData[actionId]["id"] = actionId;
                this.actionData[actionId]["name"] = this.actionData[actionId]["name_en"];
                this.actionData[actionId]["description"] = this.actionData[actionId]["help_en"];
                this.actionDataNameCache[name] = actionId;
                return this.actionData[actionId];
            }
        }
        return null;
    }

}

/**
 * Fetch action data from remote server and trigger 'action-data-ready' event when done.
 */
function fetchActionData()
{
    var request = new XMLHttpRequest();
    request.open("GET", ACTION_DATA_BASE_URL + ACTION_DATA_JSON, true);
    request.send();
    request.addEventListener("load", function(e) {
        console.log(">> Action data fetched.");
        var data = JSON.parse(request.response);
        if (data) {
            _actionData = new ActionData(data);
            window.dispatchEvent(
                new CustomEvent("app:action-data", {"detail" : _actionData})
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