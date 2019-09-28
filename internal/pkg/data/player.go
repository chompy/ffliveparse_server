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

import "github.com/jinzhu/gorm"

// Player - Data about a player
type Player struct {
	gorm.Model
	ID      int32  `json:"id" gorm:"unique;not null"`
	Name    string `json:"name" gorm:"type:varchar(128)"`
	ActName string `json:"act_name" gorm:"type:varchar(128)"`
	World   string `json:"world" gorm:"type:varchar(64)"`
}
