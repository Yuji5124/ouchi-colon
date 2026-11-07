import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
const compiler=process.env.CXX||'g++';
mkdirSync('work',{recursive:true});const exe=process.platform==='win32'?'work/motor-core-test.exe':'work/motor-core-test';
const built=spawnSync(compiler,['-std=c++17','-Wall','-Wextra','-Werror','-Ifirmware/motor-test/include','firmware/motor-test/test/core_test.cpp','-o',exe],{stdio:'inherit'});
if(built.error){console.error('C++17コンパイラをPATHまたはCXXで指定してください。');process.exit(1);}
if(built.status!==0)process.exit(built.status??1);
const result=spawnSync(exe,[],{stdio:'inherit'});process.exit(result.status??1);
