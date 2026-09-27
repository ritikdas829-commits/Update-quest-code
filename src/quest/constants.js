import { randomUUID } from 'node:crypto';

export class Constants {
    // Apne current Discord desktop app ke version ke mutabiq yeh string update karein
    static USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9000 Chrome/130.0.0.0 Electron/33.0.0 Safari/537.36';
    
    static Properties = {
        os: 'Windows',
        browser: 'Discord Client',
        release_channel: 'stable',
        client_version: '1.0.9000', // Apna current version dalein
        os_version: '10.0.19045',
        os_arch: 'x64',
        app_arch: 'x64',
        system_locale: 'en-US',
        has_client_mods: false,
        client_launch_id: randomUUID(),
        browser_user_agent: Constants.USER_AGENT,
        browser_version: '33.0.0',
        os_sdk_version: '19045',
        client_build_number: 480000, // Apna latest build number yahan update karein
        native_build_number: 75000,
        client_event_source: null,
        launch_signature: randomUUID(),
        client_heartbeat_session_id: randomUUID(),
        client_app_state: 'focused',
    };
}
