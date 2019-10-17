const MESSAGE_READ_FILE = 'read_file';
const MESSAGE_RESULT = 'result';

export interface EsphomeRange {
	document: string;
	start_line: number;
	start_col: number;
	end_line: number;
	end_col: number;
}

export interface ValidationError {
	range: EsphomeRange | null;
	message: string;
}

export interface MessageReadFile {
	type: typeof MESSAGE_READ_FILE;
	path: string;
}

export interface YamlValidationError {
	message: string;
}

export interface MessageResult {
	type: typeof MESSAGE_RESULT;
	validation_errors: ValidationError[];
	yaml_errors: YamlValidationError[];
}

export type MessageTypes = MessageReadFile | MessageResult;