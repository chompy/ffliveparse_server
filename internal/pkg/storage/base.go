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

package storage

// StoreTypeLogLine - denotes log line storage type
const StoreTypeLogLine = "LogLine"

// StoreTypeCombatant - denotes combatant storage type
const StoreTypeCombatant = "Combatant"

// StoreTypeEncounter - denotes encounter storage type
const StoreTypeEncounter = "Encounter"

// StoreTypePlayer - denotes player storage type
const StoreTypePlayer = "Player"

// StoreTypeUser - denotes user storage type
const StoreTypeUser = "User"

// BaseHandler - base storage handler
type BaseHandler interface {
	Init() error
	Store(data []interface{}) error
	FetchBytes(params map[string]interface{}) ([]byte, int, error)
	Fetch(params map[string]interface{}) ([]interface{}, int, error)
	CleanUp() error
}
