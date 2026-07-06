export namespace main {
	
	export class TerminalSessionInfo {
	    sessionId: string;
	    repoId: string;
	    repoPath: string;
	    shell: string;
	    startedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new TerminalSessionInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sessionId = source["sessionId"];
	        this.repoId = source["repoId"];
	        this.repoPath = source["repoPath"];
	        this.shell = source["shell"];
	        this.startedAt = source["startedAt"];
	    }
	}
	export class TerminalSessionRequest {
	    repoId: string;
	    repoPath: string;
	    cols?: number;
	    rows?: number;
	
	    static createFrom(source: any = {}) {
	        return new TerminalSessionRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.repoId = source["repoId"];
	        this.repoPath = source["repoPath"];
	        this.cols = source["cols"];
	        this.rows = source["rows"];
	    }
	}

}

export namespace snapshot {
	
	export class AICommitSettings {
	    apiKey: string;
	    baseUrl: string;
	    model: string;
	    maxDiffChars: number;
	    generateThree: boolean;
	    stagedOnly: boolean;
	    promptTemplate: string;
	
	    static createFrom(source: any = {}) {
	        return new AICommitSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.apiKey = source["apiKey"];
	        this.baseUrl = source["baseUrl"];
	        this.model = source["model"];
	        this.maxDiffChars = source["maxDiffChars"];
	        this.generateThree = source["generateThree"];
	        this.stagedOnly = source["stagedOnly"];
	        this.promptTemplate = source["promptTemplate"];
	    }
	}
	export class PullResult {
	    id: string;
	    name: string;
	    path: string;
	    result: string;
	    detail: string;
	    commits?: number;
	
	    static createFrom(source: any = {}) {
	        return new PullResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.path = source["path"];
	        this.result = source["result"];
	        this.detail = source["detail"];
	        this.commits = source["commits"];
	    }
	}
	export class CommitSummary {
	    hash: string;
	    shortHash: string;
	    author: string;
	    time: string;
	    message: string;
	    additions: number;
	    deletions: number;
	
	    static createFrom(source: any = {}) {
	        return new CommitSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hash = source["hash"];
	        this.shortHash = source["shortHash"];
	        this.author = source["author"];
	        this.time = source["time"];
	        this.message = source["message"];
	        this.additions = source["additions"];
	        this.deletions = source["deletions"];
	    }
	}
	export class FileChange {
	    id: string;
	    status: string;
	    path: string;
	    additions: number;
	    deletions: number;
	    size: string;
	    staged: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FileChange(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.status = source["status"];
	        this.path = source["path"];
	        this.additions = source["additions"];
	        this.deletions = source["deletions"];
	        this.size = source["size"];
	        this.staged = source["staged"];
	    }
	}
	export class RepoDetail {
	    id: string;
	    name: string;
	    branch: string;
	    path: string;
	    remote: string;
	    category: string;
	    modified: number;
	    ahead: number;
	    behind: number;
	    conflicts: number;
	    status: string;
	    scanError?: string;
	    lastScan: string;
	    files: FileChange[];
	    stagedCount: number;
	    unstagedCount: number;
	    scannedAt: string;
	    history: CommitSummary[];
	
	    static createFrom(source: any = {}) {
	        return new RepoDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.branch = source["branch"];
	        this.path = source["path"];
	        this.remote = source["remote"];
	        this.category = source["category"];
	        this.modified = source["modified"];
	        this.ahead = source["ahead"];
	        this.behind = source["behind"];
	        this.conflicts = source["conflicts"];
	        this.status = source["status"];
	        this.scanError = source["scanError"];
	        this.lastScan = source["lastScan"];
	        this.files = this.convertValues(source["files"], FileChange);
	        this.stagedCount = source["stagedCount"];
	        this.unstagedCount = source["unstagedCount"];
	        this.scannedAt = source["scannedAt"];
	        this.history = this.convertValues(source["history"], CommitSummary);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AppSnapshot {
	    scannedAt: string;
	    categories: string[];
	    repos: RepoDetail[];
	    repoDetails: Record<string, RepoDetail>;
	    selectedRepoId: string;
	    pullResults: PullResult[];
	    commitCandidates: Record<string, Array<CommitCandidate>>;
	
	    static createFrom(source: any = {}) {
	        return new AppSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.scannedAt = source["scannedAt"];
	        this.categories = source["categories"];
	        this.repos = this.convertValues(source["repos"], RepoDetail);
	        this.repoDetails = this.convertValues(source["repoDetails"], RepoDetail, true);
	        this.selectedRepoId = source["selectedRepoId"];
	        this.pullResults = this.convertValues(source["pullResults"], PullResult);
	        this.commitCandidates = this.convertValues(source["commitCandidates"], Array<CommitCandidate>, true);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BatchResult {
	    snapshot: AppSnapshot;
	    results?: PullResult[];
	    operation?: string;
	
	    static createFrom(source: any = {}) {
	        return new BatchResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.snapshot = this.convertValues(source["snapshot"], AppSnapshot);
	        this.results = this.convertValues(source["results"], PullResult);
	        this.operation = source["operation"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CommitCandidate {
	    id: string;
	    style: string;
	    icon: string;
	    title: string;
	    body: string;
	    full: string;
	
	    static createFrom(source: any = {}) {
	        return new CommitCandidate(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.style = source["style"];
	        this.icon = source["icon"];
	        this.title = source["title"];
	        this.body = source["body"];
	        this.full = source["full"];
	    }
	}
	
	
	
	export class RepoActionRequest {
	    fileId: string;
	    filePath: string;
	    message: string;
	    repoPath: string;
	
	    static createFrom(source: any = {}) {
	        return new RepoActionRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fileId = source["fileId"];
	        this.filePath = source["filePath"];
	        this.message = source["message"];
	        this.repoPath = source["repoPath"];
	    }
	}
	export class RepoCommandRequest {
	    repoPath: string;
	    command: string;
	    streamId?: string;
	
	    static createFrom(source: any = {}) {
	        return new RepoCommandRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.repoPath = source["repoPath"];
	        this.command = source["command"];
	        this.streamId = source["streamId"];
	    }
	}
	export class RepoCommandResult {
	    repoPath: string;
	    command: string;
	    output: string;
	    exitCode: number;
	    startedAt: number;
	    endedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new RepoCommandResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.repoPath = source["repoPath"];
	        this.command = source["command"];
	        this.output = source["output"];
	        this.exitCode = source["exitCode"];
	        this.startedAt = source["startedAt"];
	        this.endedAt = source["endedAt"];
	    }
	}
	
	export class RepoLog {
	    repoId: string;
	    repoName: string;
	    path: string;
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new RepoLog(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.repoId = source["repoId"];
	        this.repoName = source["repoName"];
	        this.path = source["path"];
	        this.content = source["content"];
	    }
	}
	export class ScanRoot {
	    path: string;
	    category: string;
	
	    static createFrom(source: any = {}) {
	        return new ScanRoot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.category = source["category"];
	    }
	}
	export class Request {
	    scanRoots: ScanRoot[];
	    concurrency: number;
	    pullStrategy: string;
	    pushStrategy: string;
	    refreshRemotes?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Request(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.scanRoots = this.convertValues(source["scanRoots"], ScanRoot);
	        this.concurrency = source["concurrency"];
	        this.pullStrategy = source["pullStrategy"];
	        this.pushStrategy = source["pushStrategy"];
	        this.refreshRemotes = source["refreshRemotes"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

