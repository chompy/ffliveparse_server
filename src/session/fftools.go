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
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"../app"
)

const loginUIDCookie = "fft_uid"
const loginTokenCookie = "fft_token"

// FFToolsUser - FFTools user data
type FFToolsUser struct {
	UID      string `json:"uid"`
	Username string `json:"username"`
	Email    string `json:"email"`
	State    int    `json:"state"`
	token    string
}

// FFToolsUserManager - fetch users from fftools
type FFToolsUserManager struct {
	users      map[string]FFToolsUser
	ffToolsURL string
	logger     app.Logging
}

// NewFFToolsUserManager - create new fftools user manager
func NewFFToolsUserManager() FFToolsUserManager {
	return FFToolsUserManager{
		users:      make(map[string]FFToolsUser, 0),
		ffToolsURL: app.GetFFToolsURL(),
		logger:     app.Logging{ModuleName: "FFTOOLS"},
	}
}

// fetchFromAPI - fetch fftools user from API
func (f *FFToolsUserManager) fetchFromAPI(uid string, token string) (FFToolsUser, error) {
	if f.ffToolsURL == "" {
		return FFToolsUser{}, fmt.Errorf("fftools url not set")
	}
	f.logger.Log(fmt.Sprintf("Fetch FFTools user '%s' from API.", uid))
	postData := url.Values{}
	postData.Set("uid", uid)
	postData.Set("token", token)
	outReq, err := http.NewRequest(
		http.MethodPost,
		f.ffToolsURL+"api/user",
		strings.NewReader(postData.Encode()),
	)
	if err != nil {
		return FFToolsUser{}, err
	}
	outReq.Header.Add("Content-Type", "application/x-www-form-urlencoded")
	client := &http.Client{}
	resp, err := client.Do(outReq)
	if err != nil {
		return FFToolsUser{}, err
	}
	if resp.StatusCode != http.StatusOK {
		return FFToolsUser{}, fmt.Errorf("fftools responded with status code %d", resp.StatusCode)
	}
	bodyBuf := bytes.Buffer{}
	_, err = bodyBuf.ReadFrom(resp.Body)
	if err != nil {
		return FFToolsUser{}, err
	}
	user := FFToolsUser{}
	err = json.Unmarshal(bodyBuf.Bytes(), &user)
	user.token = token
	return user, err
}

// Fetch - fetch fftools user data from token in cookie
func (f *FFToolsUserManager) Fetch(r *http.Request) (FFToolsUser, error) {
	uid, err := r.Cookie(loginUIDCookie)
	if err != nil {
		return FFToolsUser{}, nil
	}
	token, err := r.Cookie(loginTokenCookie)
	if err != nil {
		return FFToolsUser{}, nil
	}
	if uid.Value == "" || token.Value == "" {
		return FFToolsUser{}, nil
	}
	// cached/stored user
	user := f.users[uid.Value]
	if user.UID != "" && user.token == token.Value {
		return user, nil
	}
	// fetch from api
	user, err = f.fetchFromAPI(uid.Value, token.Value)
	if err != nil {
		return user, err
	}
	// store in cache
	f.users[user.UID] = user
	return user, nil
}

// GetUIDFromUsername - get userfrom from uid
func (f *FFToolsUserManager) GetUIDFromUsername(username string) (string, error) {
	if f.ffToolsURL == "" {
		return "", fmt.Errorf("fftools url not set")
	}
	// cached/stored user
	for uid := range f.users {
		if f.users[uid].Username == username {
			return uid, nil
		}
	}
	// fetch from api
	f.logger.Log(fmt.Sprintf("Fetch FFTools UID for username '%s' from API.", username))
	outReq, err := http.NewRequest(
		http.MethodGet,
		f.ffToolsURL+fmt.Sprintf("api/uid-from-username?username=%s", username),
		strings.NewReader(""),
	)
	if err != nil {
		return "", err
	}
	client := &http.Client{}
	resp, err := client.Do(outReq)
	if err != nil {
		return "", err
	}
	bodyBuf := bytes.Buffer{}
	_, err = bodyBuf.ReadFrom(resp.Body)
	if err != nil {
		return "", err
	}
	user := FFToolsUser{}
	err = json.Unmarshal(bodyBuf.Bytes(), &user)
	if user.UID == "" {
		return "", fmt.Errorf("uid not found")
	}
	// cache
	user.Username = username
	f.users[user.UID] = user
	return user.UID, err
}
