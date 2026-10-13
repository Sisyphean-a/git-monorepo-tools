package snapshot

import (
	"strings"
	"unicode/utf8"
)

const BackgroundTaskLogBytes = 128 * 1024

// Rule: 两条输出管道分别补全 UTF-8 尾部，避免 stderr 插入 stdout 的半个字符中间。
type taskOutputWriter struct {
	pending string
	append  func(string)
}

func (w *taskOutputWriter) write(text string) {
	text = w.pending + text
	end := len(text)
	start := end - 1
	for start >= 0 && !utf8.RuneStart(text[start]) {
		start--
	}
	if start >= 0 && !utf8.FullRuneInString(text[start:]) {
		end = start
	}
	w.pending = text[end:]
	if end > 0 {
		w.append(text[:end])
	}
}

func (w *taskOutputWriter) flush() {
	if w.pending != "" {
		w.append(strings.ToValidUTF8(w.pending, "�"))
		w.pending = ""
	}
}

// Rule: 固定容量环形缓冲只保留尾部；游标按原始字节计数，不随日志淘汰回退。
type taskLog struct {
	data []byte
	end  int64
}

type BackgroundTaskLog struct {
	Text      string `json:"text"`
	Cursor    int64  `json:"cursor"`
	Reset     bool   `json:"reset"`
	Truncated bool   `json:"truncated"`
}

func (l *taskLog) write(text string) {
	if text == "" {
		return
	}
	if l.data == nil {
		l.data = make([]byte, BackgroundTaskLogBytes)
	}
	start := 0
	if len(text) > len(l.data) {
		start = len(text) - len(l.data)
	}
	position := int((l.end + int64(start)) % int64(len(l.data)))
	written := copy(l.data[position:], text[start:])
	copy(l.data, text[start+written:])
	l.end += int64(len(text))
}

func (l *taskLog) read(cursor int64) BackgroundTaskLog {
	oldest := max(int64(0), l.end-BackgroundTaskLogBytes)
	reset := cursor < oldest || cursor < 0 || cursor > l.end
	start := cursor
	if reset {
		start = oldest
	}
	result := BackgroundTaskLog{Cursor: l.end, Reset: reset, Truncated: oldest > 0}
	if start == l.end {
		return result
	}
	data := make([]byte, l.end-start)
	position := int(start % int64(len(l.data)))
	copied := copy(data, l.data[position:])
	copy(data[copied:], l.data[:len(data)-copied])
	// Rule: 淘汰可能切断首个 UTF-8 字符；尾部尚未写完的字符留到下一次读取。
	for len(data) > 0 && !utf8.RuneStart(data[0]) {
		data = data[1:]
	}
	for len(data) > 0 {
		_, size := utf8.DecodeLastRune(data)
		if size != 1 || data[len(data)-1] < utf8.RuneSelf {
			break
		}
		result.Cursor--
		data = data[:len(data)-1]
	}
	result.Text = string(data)
	return result
}
