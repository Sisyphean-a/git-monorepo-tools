export type DockerAction = 'build' | 'update' | 'start' | 'stop' | 'restart';
export type DockerFiles = { compose?: string; dockerfile?: string };
export type DockerImage = { name: string; id?: string };
export type DockerContainer = {
  name: string;
  state: string;
  health?: string;
  otherImage?: boolean;
  localPorts?: string[];
};
export type DockerService = {
  name: string;
  buildable: boolean;
  image: DockerImage;
  containers: DockerContainer[];
};
export type DockerProject = {
  files: DockerFiles;
  engine: 'no-config' | 'missing-cli' | 'unreachable' | 'non-local' | 'missing-compose' | 'ready';
  error?: string;
  services: DockerService[];
  image?: DockerImage;
};
export type DockerOperation = {
  id: number;
  action: DockerAction;
  service?: string;
  stage: 'prepare' | 'build' | 'launch' | 'health' | 'start' | 'stop' | 'restart';
  status: 'running' | 'succeeded' | 'failed';
  error?: string;
  output?: string;
  truncated?: boolean;
};
export type DockerOutput = { text: string; truncated: boolean };
