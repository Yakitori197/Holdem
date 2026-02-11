# Texas Hold'em Equity Calculator — Web

德州撲克勝率計算器，純前端 React 應用，使用 Monte Carlo 模擬引擎。

## 本地開發

```bash
npm install
npm run dev      # 啟動開發伺服器 http://localhost:5173
npm run build    # 產生 dist/ 靜態檔案
npm run preview  # 預覽 build 結果
```

## 部署到 Render Static Site

### 方法一：透過 GitHub（推薦）

1. **建立 GitHub repo**
   ```bash
   cd holdem-web
   git init
   git add -A
   git commit -m "init: holdem equity calculator"
   ```
   在 GitHub 建立新 repo，然後：
   ```bash
   git remote add origin https://github.com/你的帳號/holdem-web.git
   git push -u origin main
   ```

2. **在 Render 建立 Static Site**
   - 前往 https://dashboard.render.com → New → Static Site
   - 連結你的 GitHub repo
   - 設定：
     - **Build Command**: `npm install && npm run build`
     - **Publish Directory**: `dist`
   - 點 Create Static Site

3. **完成**
   Render 會自動 build 並部署，給你一個 `https://xxx.onrender.com` 網址。
   之後每次 push 到 main 都會自動重新部署。

### 方法二：透過 render.yaml（Blueprint）

本專案已包含 `render.yaml`，你也可以：
1. Push 到 GitHub
2. 前往 https://dashboard.render.com → New → Blueprint
3. 選擇你的 repo，Render 會自動讀取 render.yaml 設定

### Render 設定摘要

| 欄位 | 值 |
|------|---|
| Environment | Static Site |
| Build Command | `npm install && npm run build` |
| Publish Directory | `dist` |
| Plan | Free |

## 專案結構

```
holdem-web/
  index.html           # Vite 入口 HTML
  package.json         # 依賴與 scripts
  vite.config.js       # Vite 設定
  render.yaml          # Render 部署設定
  .gitignore
  src/
    main.jsx           # React 入口
    App.jsx            # 主應用（引擎 + UI + 分析）
```

## 技術

- React 18 + Vite 6
- 純前端，無後端 / 無外部 API
- Monte Carlo 引擎在主執行緒分片非同步執行
- 產出為純靜態檔案，可部署到任何靜態託管
