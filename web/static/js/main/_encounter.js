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
 * Store information abount an encounter.
 */
class Encounter
{

    constructor()
    {
        this.data = null;
    }

    update(encounter)
    {
        this.data = encounter;
    }

    /**
     * Get encounter start time.
     * @return {Date}
     */
    getStartTime()
    {
        if (typeof(this.data.StartTime) != "undefined") {
            return this.data.StartTime;
        }
        return new Date();
    }

    /**
     * Get encounter end time, or current time if
     * encounter is still active.
     * @return {Date}
     */
    getEndTime()
    {
        if (this.data.Active && !this.data.EndWait) {
            return new Date();
        }
        if (typeof(this.data.EndTime) != "undefined") {
            return this.data.EndTime;
        }
        return new Date();
    }

    /**
     * Get length of encounter in milliseconds.
     * @return {integer}
     */
    getLength()
    {
        var length = this.getEndTime().getTime() - this.getStartTime().getTime();
        if (length < 1000) {
            length = 1000;
        }
        return length;
    }

}