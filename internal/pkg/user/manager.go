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
	"fmt"

	"../data"
	"../storage"

	_ "github.com/mattn/go-sqlite3" // sqlite driver
)

// Manager - manages users data
type Manager struct {
	storage *storage.Manager
}

// NewManager - create new user manager
func NewManager(sm *storage.Manager) Manager {
	return Manager{
		storage: sm,
	}
}

// New - create a new user
func (m *Manager) New() data.User {
	ud := data.NewUser()
	m.Save(&ud)
	return ud
}

// LoadFromID - load user from id
func (m *Manager) LoadFromID(ID int64) (data.User, error) {
	res, count, err := m.storage.Fetch(map[string]interface{}{
		"type": storage.StoreTypeUser,
		"id":   int(ID),
	})
	if err != nil {
		return data.User{}, err
	}
	if count == 0 {
		return data.User{}, fmt.Errorf("no user found with ID '%d'", ID)
	}
	return res[0].(data.User), nil
}

// LoadFromUploadKey - load user from upload key
func (m *Manager) LoadFromUploadKey(uploadKey string) (data.User, error) {
	res, count, err := m.storage.Fetch(map[string]interface{}{
		"type":       storage.StoreTypeUser,
		"upload_key": uploadKey,
	})
	if err != nil {
		return data.User{}, err
	}
	if count == 0 {
		return data.User{}, fmt.Errorf("no user found with upload key '%s'", uploadKey)
	}
	return res[0].(data.User), nil
}

// LoadFromWebKey - load user from web key
func (m *Manager) LoadFromWebKey(webKey string) (data.User, error) {
	res, count, err := m.storage.Fetch(map[string]interface{}{
		"type":    storage.StoreTypeUser,
		"web_key": webKey,
	})
	if err != nil {
		return data.User{}, err
	}
	if count == 0 {
		return data.User{}, fmt.Errorf("no user found with web key '%s'", webKey)
	}
	return res[0].(data.User), nil
}

// LoadFromWebIDString - load user from web ID string
func (m *Manager) LoadFromWebIDString(webIDString string) (data.User, error) {
	userID, err := data.GetIDFromWebIDString(webIDString)
	if err != nil {
		return data.User{}, err
	}
	return m.LoadFromID(userID)
}

// Save - save user data
func (m *Manager) Save(ud *data.User) {
	store := make([]interface{}, 1)
	store[0] = &ud
	m.storage.Store(store)
	// TODO no error return?
}
