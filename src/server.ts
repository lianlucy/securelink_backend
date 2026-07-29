import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import sequelize from './config/database';
import { User } from './models/User';
import { SignalQueue } from './models/SignalQueue';
import { TransactionLog } from './models/TransactionLog';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =================================================================
// 1. 콘솔 로그 타임스탬프 커스텀 래핑 (안정성 강화 버전)
// =================================================================
console.log = function (...args: any[]) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const timestamp = `[${year}-${month}-${day} ${hours}:${minutes}:${seconds}]`;
    
    // 객체 지향 출력 시 문자열 결합 오류 및 스트림 터짐 방지 처리
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
    process.stdout.write(`${timestamp} ${message}\n`);
};

console.log("=========================================");
console.log(" Secure Link 동적 매핑 및 전화추적 중계 서버 (TS)");
console.log("=========================================");

// DB 세팅 초기 동기화 및 커넥션 테스트
sequelize.authenticate()
    .then(() => {
        console.log(`🔌 데이터베이스 연결 성공! (Dialect: ${sequelize.getDialect()})`);
        return sequelize.sync({ alter: false });
    })
    .catch((err) => {
        console.error('❌ 데이터베이스 초기화 및 동기화 실패 상세 내역:', err);
        process.exit(1);
    });
	
// 헬퍼 함수: 이력을 적재하는 공통 메서드 (안전한 비동기 예외 격리)
async function insertTransactionLog(userId: string, actionType: string, detailsObj: object | null): Promise<void> {
    try {
        const detailsStr = detailsObj ? JSON.stringify(detailsObj) : null;
        await TransactionLog.create({
            user_id: userId,
            action_type: actionType,
            details: detailsStr
        });
        console.log(`📊 [트랜잭션 성공] ${userId} - ${actionType} 로그 적재 완료`);
    } catch (err: any) {
        console.error(`⚠️ [트랜잭션 내부 에러 차단] ${actionType} 기록 중 DB 오류 발생:`, err.message);
    }
}

// 1. 기기가 켜질 때 현재 모드와 상태를 동적으로 서버에 갱신하는 곳
app.post('/api/update-status', async (req: Request, res: Response) => {
    try {
        const { user_id, mode } = req.body;
        await User.update(
            { current_mode: mode, is_online: 1 },
            { where: { id: user_id } }
        );
        console.log(`[기기 상태 등록] 유저: ${user_id} | 모드: ${mode} | 상태: ONLINE`);
        return res.status(200).json({ success: true });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// 2. [송신폰이 호출] 현재 서버에 '수신 모드(RECEIVE)' 상태로 온라인 대기 중인 목록 전달
app.get('/api/active-receivers', async (req: Request, res: Response) => {
    try {
        const receivers = await User.findAll({
            where: { current_mode: 'RECEIVE', is_online: 1 },
            attributes: ['id']
        });
        const activeUsers = receivers.map(row => row.id);
        return res.status(200).json(activeUsers);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// 3. [송신폰이 신호 쏠 때] 트랜잭션 로그 적재 및 큐 저장
app.post('/api/push-signal', async (req: Request, res: Response) => {
    try {
        const { sender_id, target_id, type, from, content } = req.body;
        
        // 큐에 신호 인서트
        await SignalQueue.create({
            sender_id,
            target_id,
            type,
            from,
            content
        });

        console.log(`🚨 [신호 입수] ${sender_id} ➡️ 타겟고객: ${target_id}`);
        console.log(`형태: ${type} | 발신: ${from} | 내용: ${content}`);
        
        const actionType = (type === 'SMS') ? 'SMS_SEND' : 'CALL_SEND';
        const logDetails = { target_id, from, content };
        
        // 💡 비동기 누수 방지를 위해 명확히 동기 조율 실행
        await insertTransactionLog(sender_id, actionType, logDetails);
        
        return res.status(200).json({ success: true });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// 4. [수신폰이 찔러볼 때] 신호 소비 및 수신 로그 생성
app.get('/api/fetch-signal', async (req: Request, res: Response) => {
    try {
        const { user_id } = req.query;

        if (!user_id || typeof user_id !== 'string') {
            return res.status(400).json({ error: '정상적인 user_id 쿼리가 필요합니다.' });
        }

        // 1. 미수신 신호 전체 조회 (findOne -> findAll)
        const pendingSignals = await SignalQueue.findAll({
            where: { target_id: user_id, is_fetched: 0 },
            order: [['idx', 'ASC']]
        });

        // 처리할 신호가 없으면 빈 배열 반환
        if (!pendingSignals || pendingSignals.length === 0) {
            return res.status(200).json([]);
        }

        const signalIds = pendingSignals.map(s => s.idx);

        // 2. 조회된 신호 일괄 수신 플래그 업데이트
        await SignalQueue.update(
            { is_fetched: 1 },
            { where: { idx: signalIds } } // IN 조건으로 한 번에 업데이트
        );

        console.log(`📲 [수신 배달 완료] 수신폰 ${user_id}에게 총 ${pendingSignals.length}건의 신호 밀어줌`);

        // 3. 트랜잭션 로그 일괄 작성 (비동기 병렬 처리)
        const logPromises = pendingSignals.map(signal => {
            const actionType = (signal.type === 'SMS') ? 'SMS_RECV' : 'CALL_RECV';
            const logDetails = {
                sender_id: signal.sender_id,
                from: signal.from,
                content: signal.content
            };
            return insertTransactionLog(user_id, actionType, logDetails);
        });
        await Promise.all(logPromises);

        // 4. 신호 목록 배열(Array) 형태로 리턴
        return res.status(200).json(pendingSignals);

    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// 5. 기기 로그아웃 요청 시 'LOGOUT' 처리
app.post('/api/logout', async (req: Request, res: Response) => {
    try {
        const { user_id } = req.body;
        await User.update(
            { current_mode: 'NONE', is_online: 0 },
            { where: { id: user_id } }
        );
        console.log(`🚪 [기기 로그아웃] 유저: ${user_id} | 모드: NONE | 상태: OFFLINE 전환 완료`);
        
        // 💡 비동기 누수 원인 제거를 위한 await 배치와 명확한 객체 변환
        await insertTransactionLog(user_id, 'LOGOUT', { action: 'logout_success' });
        return res.status(200).json({ success: true, message: "로그아웃 성공" });
    } catch (err: any) {
        console.error("로그아웃 DB 갱신 오류:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

// 6. 로그인 성공 시 'LOGIN' 연동
app.post('/api/login', async (req: Request, res: Response) => {
    try {
        const { id, pw } = req.body;
        console.log(`🔑 [로그인 시도] ID: ${id}`);

        const user = await User.findOne({
            where: { id, pw }
        });

        if (user) {
            // 💡 완벽한 추적을 보장하고 스트림 파손을 원천 차단
            await insertTransactionLog(id, 'LOGIN', { ip: req.ip || 'unknown_ip' });
            return res.status(200).json({ success: true });
        } else {
            console.log(`❌ [로그인 실패] 일치하는 회원 정보 없음 (ID: ${id})`);
            return res.status(401).json({ success: false });
        }
    } catch (err: any) {
        console.error("💥 [로그인 라우터 치명적 에러]:", err);
        return res.status(500).json({ error: err.message });
    }
});

// 7. 회원가입 성공 시 'SIGNUP' 연동
app.post('/api/signup', async (req: Request, res: Response) => {
    try {
        const { id, pw } = req.body;
        await User.create({ id, pw });
        
        // 💡 비동기 누수 방지 조치
        await insertTransactionLog(id, 'SIGNUP', { action: 'signup_success' });
        return res.status(200).json({ success: true });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/device-log', (req: Request, res: Response) => {
    try {
        const { device_id, role, step, message, timestamp } = req.body;

        // 역할(Role)에 따른 프리픽스 및 구분용 기호 설정
        const deviceRole = role || (device_id?.includes('TRANSMITTER') ? 'TRANSMITTER' : 'RECEIVER');
        const badge = deviceRole === 'TRANSMITTER' ? '📤 [TX]' : '📥 [RX]';

        // 🖥️ 서버 터미널 콘솔에 한 줄로 깔끔하게 출력
        console.log(
            `[${timestamp || new Date().toISOString()}] ${badge} [${device_id || 'UNKNOWN'}] ` +
            `[${step || 'LOG'}] ${message || ''}`
        );

        // 안드로이드 앱에 성공 응답 전달
        res.status(200).json({ success: true, message: 'Log received' });
    } catch (error) {
        console.error('❌ 로그 처리 중 오류 발생:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

app.listen(PORT, () => console.log(`🚀 타입스크립트 중계 메인 라우터 가동 완료 [포트: ${PORT}]`));

// =================================================================
// 🚨 프로세스 소리 없는 죽음 방어 (최종 예외 예방책)
// =================================================================
process.on('uncaughtException', (err) => {
    console.error('💥 [잡히지 않은 치명적 에러 감지 - 서버 살려둠]:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 [미처리 비동기 거부 감지 - 서버 살려둠]:', reason);
});