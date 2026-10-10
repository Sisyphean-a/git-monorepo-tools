package monitor

// Rule: 终端归属只接受管理器提供的根身份或已验证 Job 成员，PID 与创建时间必须同时匹配；重复归属保持未知。
func attachTerminalScopes(snapshot *Snapshot) {
	owners := make(map[ProcessIdentity]string)
	conflicts := make(map[ProcessIdentity]bool)
	for _, scope := range snapshot.Terminals {
		identities := append([]ProcessIdentity{{PID: scope.RootPID, CreatedAt: scope.RootCreatedAt}}, scope.Members...)
		for _, identity := range identities {
			if identity.PID == 0 || identity.CreatedAt == 0 {
				continue
			}
			if owner, found := owners[identity]; found && owner != scope.SessionID {
				conflicts[identity] = true
			}
			owners[identity] = scope.SessionID
		}
	}
	unknownIdentities := make(map[uint32]bool)
	for index := range snapshot.Children {
		process := &snapshot.Children[index]
		identity := ProcessIdentity{PID: process.PID, CreatedAt: process.CreatedAt}
		process.TerminalSessionID = ""
		if process.CreatedAt == 0 {
			unknownIdentities[process.PID] = true
		}
		if conflicts[identity] {
			process.AttributionError = "多个终端报告了同一进程，归属无法确认"
		} else {
			process.TerminalSessionID = owners[identity]
		}
	}
	if len(conflicts) == 0 && len(unknownIdentities) == 0 {
		return
	}
	for index := range snapshot.Terminals {
		scope := &snapshot.Terminals[index]
		seen := make(map[ProcessIdentity]bool)
		identities := append([]ProcessIdentity{{PID: scope.RootPID, CreatedAt: scope.RootCreatedAt}}, scope.Members...)
		for _, identity := range identities {
			if seen[identity] || identity.PID == 0 || identity.CreatedAt == 0 {
				continue
			}
			seen[identity] = true
			var failure string
			if conflicts[identity] {
				failure = "存在多会话归属冲突，无法确认完整合计"
			} else if unknownIdentities[identity.PID] {
				failure = "成员进程身份读取失败，无法确认完整合计"
			}
			if failure != "" {
				if scope.Error != "" {
					scope.Error += "；"
				}
				scope.Error += failure
				break
			}
		}
	}
}
