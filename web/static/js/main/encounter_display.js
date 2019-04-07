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

var ENCOUNTER_TIME_ID = "encounter-time";
var ENCOUNTER_LENGTH_ID = "encounter-length";
var ENCOUNTER_NAME_ID = "encounter-name";
var ENCOUNTER_STATUS_ID ="encounter-status";

/**
 * Display encounter data.
 */
class EncounterDisplay
{

    constructor()
    {
        this.startTime = null;
        this.offset = 0;
        this.encounterId = "";
        this.combatants = [];
        this.tickTimeout = null;
        this.encounterTimeElement = document.getElementById(ENCOUNTER_TIME_ID);
        this.encounterLengthElement = document.getElementById(ENCOUNTER_LENGTH_ID);
        this.encounterNameElement = document.getElementById(ENCOUNTER_NAME_ID);
        this.encounterStatusElement = document.getElementById(ENCOUNTER_STATUS_ID);
    }

    init()
    {
        // reset
        this.reset();
        // hook events
        var t = this;
        window.addEventListener("act:encounter", function(e) { t._updateEncounter(e); });
        this._tick();
    }

    /**
     * Reset the display.
     */
    reset()
    {
        this.combatants = [];
        this.encounterLengthElement.innerText = "00:00";
        this.encounterNameElement.innerText = "-";
        this.encounterStatusElement.classList.add("hide");
        this.encounterStatusElement.innerText = "";
        this.encounterTimeElement.innerText = "";
        this.encounterTimeElement.classList.add("hide");
    }

    /**
     * Tick the timer and update raid dps.
     */
    _tick()
    {
        // clear old timeout
        if (this.tickTimeout) {
            clearTimeout(this.tickTimeout);
        }
        // update element
        if (this.startTime) {
            var duration = new Date().getTime() - this.startTime.getTime() + this.offset;
            this.setTimer(duration);
        }
        // run every second
        var t = this;
        this.tickTimeout = setTimeout(function() { t._tick(); }, 1000);
    }

    /**
     * Set timer to provided duration.
     * @param {integer} duration 
     */
    setTimer(duration)
    {
        var minutes = Math.floor(duration / 1000 / 60);
        if (minutes < 0) { minutes = 0; }
        var padMinutes = minutes < 10 ? "0" : "";
        var seconds = Math.floor(duration / 1000 % 60);
        if (seconds < 0) { seconds = 0; }
        var padSeconds = seconds < 10 ? "0" : "";
        this.encounterLengthElement.innerText = padMinutes + minutes + ":" + padSeconds + seconds;
    }

    /**
     * Update encounter data from act:encounter event.
     * @param {Event} event 
     */
    _updateEncounter(event)
    {
        this.encounterId = event.detail.UID;
        // new encounter active
        if (!this.startTime && event.detail.Active) {
            this.reset();
        }
        // update zone
        this.encounterNameElement.innerText = event.detail.Zone;
        // update start time
        if (event.detail.StartTime) {
            this.encounterLengthElement.classList.remove("hide");
            this.encounterTimeElement.classList.remove("hide");
            this.encounterTimeElement.innerText = event.detail.StartTime.toLocaleString();
        }

        // calculate encounter dps
        /*var encounterDps = event.detail.Damage / ((event.detail.EndTime.getTime() - event.detail.StartTime.getTime()) / 1000);
        if (!this._isValidParseNumber(encounterDps)) {
            encounterDps = 0;
        }*/
        //this.encounterDpsElement.innerText = encounterDps.toFixed(2);
        // inactive
        if (!event.detail.Active) {
            this.startTime = null;
            this.encounterLengthElement.classList.remove("active");
            var lastDuration = event.detail.EndTime.getTime() - event.detail.StartTime.getTime();
            this.setTimer(lastDuration);

            this.encounterStatusElement.classList.remove("hide");

            switch (event.detail.SuccessLevel) {
                case 2:
                case 3:
                {
                    this.encounterStatusElement.innerText = "Wipe";
                    break;
                }
                case 1:
                {
                    this.encounterStatusElement.innerText = "Clear";
                    break;
                }
                default:
                {
                    this.encounterStatusElement.innerText = "";
                }
            }
            
            return;
        }
        
        this.startTime = event.detail.StartTime;
        
        // make active encounter
        this.encounterLengthElement.classList.add("active");  
        // hide status
        this.encounterStatusElement.innerText = "";
        this.encounterStatusElement.classList.add("hide");
    }

}