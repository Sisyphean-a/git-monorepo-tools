//go:build !windows

package desktop

func (Client) ReadClipboardImagePath() (string, error) {
	return "", nil
}
