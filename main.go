package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:dist
var assets embed.FS

func main() {
	app, err := NewApp()
	if err != nil {
		log.Fatal(err)
	}

	err = wails.Run(&options.App{
		Title:  "Git Monorepo Tools",
		Width:  1440,
		Height: 900,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		// 深色标题栏跟随前端主题（theme.ts），非激活态文字弱化以区分窗口焦点
		Windows: &windows.Options{
			Theme: windows.Dark,
			CustomTheme: &windows.ThemeSettings{
				DarkModeTitleBar:          windows.RGB(0x0b, 0x11, 0x18),
				DarkModeTitleBarInactive:  windows.RGB(0x0b, 0x11, 0x18),
				DarkModeTitleText:         windows.RGB(0xdd, 0xeb, 0xff),
				DarkModeTitleTextInactive: windows.RGB(0x5f, 0x70, 0x84),
				DarkModeBorder:            windows.RGB(0x25, 0x32, 0x44),
				DarkModeBorderInactive:    windows.RGB(0x25, 0x32, 0x44),
			},
		},
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
