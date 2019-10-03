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

import (
	"errors"
	"time"

	"github.com/rs/xid"
	hashids "github.com/speps/go-hashids"
)

const webIDSalt = "aedb2d139b653ee8aeeed9010ed053e94cb01$#!756"

// User - data about an user
type User struct {
	ID        int64 `gorm:"AUTO_INCREMENT"`
	Created   time.Time
	Accessed  time.Time
	UploadKey string `gorm:"unique;not null;type:varchar(32)"` // key used to push data from ACT
	WebKey    string `gorm:"unique;not null;type:varchar(32)"` // key used to access creds via homepage (stored in cookie)
	Username  string `gorm:"unique;type:varchar(64)"`
	webIDHash string `gorm:"-"`
}

// NewUser - create new user data
func NewUser() User {
	uploadKeyGen := xid.New()
	webKeyGen := xid.New()
	usernameGen := xid.New()
	return User{
		Created:   time.Now(),
		Accessed:  time.Now(),
		UploadKey: uploadKeyGen.String(),
		WebKey:    webKeyGen.String(),
		Username:  usernameGen.String(),
	}
}

// GetWebIDString - get web id string used to access data
func (u *User) GetWebIDString() (string, error) {
	if u.webIDHash != "" {
		return u.webIDHash, nil
	}
	var err error
	u.webIDHash, err = GetWebIDStringFromID(u.ID)
	if err != nil {
		return "", err
	}
	return u.webIDHash, nil
}

// GetWebIDStringNoError - get web id string without error output
func (u *User) GetWebIDStringNoError() string {
	str, err := u.GetWebIDString()
	if err != nil {
		return ""
	}
	return str
}

// GetWebIDStringFromID - convert user id to web id string
func GetWebIDStringFromID(userID int64) (string, error) {
	hd := hashids.NewData()
	hd.Salt = webIDSalt
	hd.MinLength = 5
	h, err := hashids.NewWithData(hd)
	if err != nil {
		return "", err
	}
	idStr, err := h.EncodeInt64([]int64{userID})
	if err != nil {
		return "", err
	}
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
