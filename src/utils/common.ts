import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { URL } from 'node:url';

/**
 * 下载文件并显示进度
 * @param url 文件的 HTTPS 链接
 * @param outputPath 保存文件的本地路径
 * @param options 可选配置
 * @returns Promise<string> 返回保存的文件路径
 */
interface DownloadOptions {
    onProgress?: (progress: {
        downloaded: number;
        percentage: number;
        total: number;
    }) => void; // 进度回调
    timeout?: number; // 请求超时时间（毫秒），默认 30 秒
}

export async function downloadFile(
    url: string,
    outputPath: string,
    options: DownloadOptions = {}
): Promise<string> {
    const { onProgress, timeout = 30_000 } = options;

    return new Promise((resolve, reject) => {
        try {
            // 验证 URL
            const parsedUrl = new URL(url);
            if (parsedUrl.protocol !== 'https:') {
                throw new Error('Only HTTPS URLs are supported');
            }

            // 创建写入流
            const fileStream = fs.createWriteStream(outputPath, { flags: 'wx' });
            let downloadedBytes = 0;

            // 发起 HTTPS 请求
            const req = https.get(parsedUrl, { timeout }, (res) => {
                // 处理非 200 状态码
                if (res.statusCode !== 200) {
                    fileStream.close();
                    fs.unlink(outputPath, () => {
}); // 删除临时文件
                    reject(new Error(`HTTP Error: ${res.statusCode} ${res.statusMessage}`));
                    return;
                }

                // 获取文件大小
                const totalBytes = Number.parseInt(res.headers['content-length'] || '0', 10);

                // 处理响应流
                res.on('data', (chunk: Buffer) => {
                    downloadedBytes += chunk.length;
                    if (totalBytes > 0 && onProgress) {
                        const percentage = (downloadedBytes / totalBytes) * 100;
                        onProgress({
                            downloaded: downloadedBytes,
                            percentage: Number.parseFloat(percentage.toFixed(2)),
                            total: totalBytes,
                        });
                    }
                });

                // 管道流到文件
                res.pipe(fileStream);

                // 处理流结束
                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve(outputPath);
                });

                // 处理流错误
                res.on('error', (err) => {
                    fileStream.close();
                    fs.unlink(outputPath, () => {
});
                    reject(new Error(`Stream error: ${err.message}`));
                });
            });

            // 处理请求错误
            req.on('error', (err) => {
                fileStream.close();
                fs.unlink(outputPath, () => {
});
                reject(new Error(`Request error: ${err.message}`));
            });

            // 处理超时
            req.on('timeout', () => {
                req.destroy();
                fileStream.close();
                fs.unlink(outputPath, () => {
});
                reject(new Error('Request timed out'));
            });

            // 确保请求结束
            req.end();
        } catch (error) {
            reject(error instanceof Error ? error : new Error('Invalid URL or configuration'));
        }
    });
}

export const readJSON = async (path: string) =>
    JSON.parse(await fs.promises.readFile(path, 'utf8'));

export const writeJSON = async (path: string, data: object) =>
    fs.promises.writeFile(path, JSON.stringify(data, null, 2), 'utf8');

export const readPackageJson = async (filePath: string) =>
    readJSON(path.join(filePath, 'package.json'));

export const writePackageJson = async (filePath: string, data: object) => {
    await fs.promises.writeFile(path.join(filePath, 'package.json'), JSON.stringify(data, null, 2), 'utf8');
}

export function isEmptyDir(path: string) {
    if (!fs.existsSync(path)) {
        return true; // Non-existent directory is considered empty
    }

    const files = fs.readdirSync(path);
    return files.length === 0 || (files.length === 1 && files[0] === '.git');
}

export function getProjectRoot(): Promise<string> {
    return new Promise((resolve, reject) => {
        let currentDir = process.cwd();
        const maxDepth = 10; // Maximum number of directory levels to search
        let depth = 0;
        const checkForPackageJson = () => {
            const packageJsonPath = path.join(currentDir, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                resolve(currentDir);
            }
        }

        const traverse = () => {
            checkForPackageJson();
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir || depth >= maxDepth) {
                reject(new Error('Project root not found'));
                return;
            }

            currentDir = parentDir;
            depth++;
            setImmediate(traverse);
        }

        traverse();
    })
}

export function copyFolder({from, skipFiles, to}: {from: string, skipFiles?: string[]; to: string,}) {
    if (!fs.existsSync(from)) {
        throw new Error(`Source directory ${from} does not exist`);
    }

    if (!fs.existsSync(to)) {
        fs.mkdirSync(to);
    }

    for (const file of fs.readdirSync(from)) {
        const fromPath = path.join(from, file);
        const toPath = path.join(to, file);
        if (fs.lstatSync(fromPath).isDirectory()) {
            fs.mkdirSync(toPath, {recursive: true});
            copyFolder({from: fromPath, skipFiles, to: toPath});
        } else {
            if (skipFiles?.includes(file)) continue;
            // Create the directory if it doesn't exist
            fs.mkdirSync(path.dirname(toPath), {recursive: true});
            fs.copyFileSync(fromPath, toPath);
        }
    }
}

export function packageNameToCamelCase(str: string): string {
    return str.split('-').map((part: string) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
}