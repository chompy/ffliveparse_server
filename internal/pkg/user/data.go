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
	"errors"
	"time"

	"github.com/rs/xid"
	hashids "github.com/speps/go-hashids"
)

const webIDSalt = "aedb2d139b653ee8aeeed9010ed053e94cb01$#!756"

// Data - data about an user
type Data struct {
	ID        int64
	Created   time.Time
	Accessed  time.Time
	UploadKey string // key used to push data from ACT
	WebKey    string // key used to access creds via homepage (stored in cookie)
	webIDHash string
}

// NewData - create new user data
func NewData() Data {
	uploadKeyGen := xid.New()
	webKeyGen := xid.New()
	return Data{
		Created:   time.Now(),
		Accessed:  time.Now(),
		UploadKey: uploadKeyGen.String(),
		WebKey:    webKeyGen.String(),
	}
}

// GetWebIDString - get web id string used to access data
func (d *Data) GetWebIDString() (string, error) {
	if d.webIDHash != "" {
		return d.webIDHash, nil
	}
	hd := hashids.NewData()
	hd.Salt = webIDSalt
	hd.MinLength = 5
	h, err := hashids.NewWithData(hd)
	if err != nil {
		return "", err
	}
	idStr, err := h.EncodeInt64([]int64{d.ID})
	if err != nil {
		return "", err
	}
	d.webIDHash = idStr
	return idStr, nil
}

// GetIDFromWebIDString - convert web id string to user id int
func GetIDFromWebIDString(webIDString string) (int64, error) {
	hd := hashids.NewData()
	hd.Salt = webIDSalt
	hd.MinLength = 5
	h, err := hashids.NewWithData(hd)
	if err != nil {
		return 0, err
	}
	idInt, err := h.DecodeInt64WithError(webIDString)
	if err != nil {
		return 0, err
	}
	if len(idInt) < 1 {
		return 0, errors.New("could not convert web ID string to web ID integer")
	}
	return idInt[0], nil
}
