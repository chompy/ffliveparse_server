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

package data

// PlayerStat - stat data for single player in single encounter
type PlayerStat struct {
	Encounter Encounter `json:"encounter"`
	Combatant Combatant `json:"combatant"`
	DPS       float64   `json:"dps"`
	HPS       float64   `json:"hps"`
	URL       string    `json:"url"`
}