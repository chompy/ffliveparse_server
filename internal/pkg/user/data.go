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

package user

import (
	"time"

	"github.com/martinlindhe/base36"
	"github.com/segmentio/ksuid"
)

const webIDOffset = 1681616

// Data - data about an user
type Data struct {
	ID        int64
	Created   time.Time
	Accessed  time.Time
	UploadKey string
	WebKey    string
}

// NewData - create new user data
func NewData() Data {
	uploadKeyGen := ksuid.New()
	webKeyGen := ksuid.New()
	return Data{
		Created:   time.Now(),
		Accessed:  time.Now(),
		UploadKey: uploadKeyGen.String(),
		WebKey:    webKeyGen.String(),
	}
}

// GetWebIDString - get web id string used to access data
func (d *Data) GetWebIDString() string {
	return base36.Encode(uint64(d.ID + webIDOffset))
}

// GetIDFromWebIDString - convert web id string to user id int
func GetIDFromWebIDString(webIDString string) int64 {
	return int64(base36.Decode(webIDString)) - webIDOffset
}
