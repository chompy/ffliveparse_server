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
     * Get encounter end time, or current time if
     * encounter is still active.
     * @return {Date}
     */
    getEndTime()
    {
        if (this.data.Active) {
            return new Date();
        }
        return this.data.EndTime;
    }

    /**
     * Get length of encounter in milliseconds.
     * @return {integer}
     */
    getLength()
    {
        return this.getEndTime().getTime() - this.data.StartTime.getTime()
    }

}