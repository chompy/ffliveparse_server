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

package session

import (
	"time"

	"../data"
	"../storage"
)

// UserManager - manages users data
type UserManager struct {
	storage *storage.Manager
}

// NewUserManager - create new user manager
func NewUserManager(sm *storage.Manager) UserManager {
	return UserManager{
		storage: sm,
	}
}

// New - create a new user
func (m *UserManager) New() data.User {
	u := data.NewUser()
	m.Save(&u)
	return u
}

// LoadFromID - load user from id
func (m *UserManager) LoadFromID(ID int64) (data.User, error) {
	u, err := m.storage.DB.FetchUserFromID(ID)
	if err != nil {
		return u, err
	}
	u.Accessed = time.Now()
	return u, nil
}

// LoadFromUploadKey - load user from upload key
func (m *UserManager) LoadFromUploadKey(uploadKey string) (data.User, error) {
	u, err := m.storage.DB.FetchUserFromUploadKey(uploadKey)
	if err != nil {
		return u, err
	}
	u.Accessed = time.Now()
	return u, nil
}

// LoadFromWebKey - load user from web key
func (m *UserManager) LoadFromWebKey(webKey string) (data.User, error) {
	u, err := m.storage.DB.FetchUserFromWebKey(webKey)
	if err != nil {
		return u, err
	}
	u.Accessed = time.Now()
	return u, nil
}

// LoadFromWebIDString - load user from web ID string
func (m *UserManager) LoadFromWebIDString(webIDString string) (data.User, error) {
	userID, err := data.GetIDFromWebIDString(webIDString)
	if err != nil {
		return data.User{}, err
	}
	return m.LoadFromID(userID)
}

// Save - save user data
func (m *UserManager) Save(u *data.User) error {
	return m.storage.DB.StoreUser(u)
}
