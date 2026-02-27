import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Update state variables
content = content.replace(
  /const \[showCodeWindow, setShowCodeWindow\] = useState\(true\)/,
  `const [showSettingsWindow, setShowSettingsWindow] = useState(false)
  const [settingsDockSide, setSettingsDockSide] = useState<WorkspaceDockSide>('right')`
);

content = content.replace(
  /const \[codeWindowTab, setCodeWindowTab\] = useState<CodeWindowTab>\('code'\)/,
  `const [showGitWindow, setShowGitWindow] = useState(false)
  const [gitDockSide, setGitDockSide] = useState<WorkspaceDockSide>('left')`
);

// 2. Update layout logic
const layoutOld = `            const contentPaneIds = panels.map((p) => p.id)
            const layoutPaneIds = [
              ...(showWorkspaceWindow && workspaceDockSide === 'left' ? ['workspace-window'] : []),
              ...(showCodeWindow && workspaceDockSide === 'right' ? ['code-window'] : []),
              ...contentPaneIds,
              ...(showCodeWindow && workspaceDockSide === 'left' ? ['code-window'] : []),
              ...(showWorkspaceWindow && workspaceDockSide === 'right' ? ['workspace-window'] : []),
            ]`;

const layoutNew = `            const contentPaneIds = [
              ...panels.map((p) => p.id),
              ...editorPanels.map((p) => p.id),
            ]
            const leftDockPanels = [
              ...(showWorkspaceWindow && workspaceDockSide === 'left' ? ['workspace-window'] : []),
              ...(showGitWindow && gitDockSide === 'left' ? ['git-window'] : []),
              ...(showSettingsWindow && settingsDockSide === 'left' ? ['settings-window'] : [])
            ]
            const rightDockPanels = [
              ...(showWorkspaceWindow && workspaceDockSide === 'right' ? ['workspace-window'] : []),
              ...(showGitWindow && gitDockSide === 'right' ? ['git-window'] : []),
              ...(showSettingsWindow && settingsDockSide === 'right' ? ['settings-window'] : [])
            ]
            
            const layoutPaneIds = [...leftDockPanels, ...contentPaneIds, ...rightDockPanels]`;

content = content.replace(layoutOld, layoutNew);

// 3. Update main layout rendering to handle left/right stacks
const renderOld = `            const leftPaneId =
              (showWorkspaceWindow && workspaceDockSide === 'left' ? 'workspace-window' : null) ||
              (showCodeWindow && workspaceDockSide === 'right' ? 'code-window' : null)
            const rightPaneId =
              (showCodeWindow && workspaceDockSide === 'left' ? 'code-window' : null) ||
              (showWorkspaceWindow && workspaceDockSide === 'right' ? 'workspace-window' : null)
            const paneFlowOrientation = layoutMode === 'horizontal' ? 'vertical' : 'horizontal'
            const layoutGroupKey = `\${layoutMode}:\${leftPaneId ?? 'x'}:\${rightPaneId ?? 'x'}:\${contentPaneIds.join('|')}``;

const renderNew = `            const leftPaneId = leftDockPanels.length > 0 ? 'left-dock' : null
            const rightPaneId = rightDockPanels.length > 0 ? 'right-dock' : null
            const paneFlowOrientation = layoutMode === 'horizontal' ? 'vertical' : 'horizontal'
            const layoutGroupKey = `\${layoutMode}:\${leftDockPanels.join(',')}:\${rightDockPanels.join(',')}:\${contentPaneIds.join('|')}``;

content = content.replace(renderOld, renderNew);

const groupOld = `              <Group key={layoutGroupKey} orientation="horizontal" className="flex-1 min-h-0 min-w-0" id="main-layout">
                {leftPaneId && (
                  <>
                    <Panel
                      id={`panel-\${leftPaneId}`}
                      defaultSize="32"
                      minSize="15"
                      maxSize="55"
                      className="min-h-0 min-w-0"
                    >
                      {renderLayoutPane(leftPaneId)}
                    </Panel>
                    <Separator className="w-1 min-w-1 bg-neutral-300/80 dark:bg-neutral-700 hover:bg-blue-400 dark:hover:bg-blue-600 data-[resize-handle-active]:bg-blue-500" />
                  </>
                )}
                <Panel id="panel-content-tiled" defaultSize={leftPaneId && rightPaneId ? '36' : leftPaneId || rightPaneId ? '68' : '100'} minSize="20" className="min-h-0 min-w-0">
                  {contentPane}
                </Panel>
                {rightPaneId && (
                  <>
                    <Separator className="w-1 min-w-1 bg-neutral-300/80 dark:bg-neutral-700 hover:bg-blue-400 dark:hover:bg-blue-600 data-[resize-handle-active]:bg-blue-500" />
                    <Panel
                      id={`panel-\${rightPaneId}`}
                      defaultSize="32"
                      minSize="15"
                      maxSize="55"
                      className="min-h-0 min-w-0"
                    >
                      {renderLayoutPane(rightPaneId)}
                    </Panel>
                  </>
                )}
              </Group>`;

const groupNew = `              <Group key={layoutGroupKey} orientation="horizontal" className="flex-1 min-h-0 min-w-0" id="main-layout">
                {leftDockPanels.length > 0 && (
                  <>
                    <Panel id="panel-left-dock" defaultSize="32" minSize="15" maxSize="55" className="min-h-0 min-w-0">
                      <Group orientation="vertical" className="h-full min-h-0 min-w-0">
                        {leftDockPanels.map((id, idx) => (
                          <React.Fragment key={id}>
                            {idx > 0 && <Separator className="h-1 min-h-1 bg-neutral-300/80 dark:bg-neutral-700 hover:bg-blue-400 dark:hover:bg-blue-600" />}
                            <Panel id={`panel-\${id}`} className="min-h-0 min-w-0">
                              {renderLayoutPane(id)}
                            </Panel>
                          </React.Fragment>
                        ))}
                      </Group>
                    </Panel>
                    <Separator className="w-1 min-w-1 bg-neutral-300/80 dark:bg-neutral-700 hover:bg-blue-400 dark:hover:bg-blue-600 data-[resize-handle-active]:bg-blue-500" />
                  </>
                )}
                <Panel id="panel-content-tiled" defaultSize={leftPaneId && rightPaneId ? '36' : leftPaneId || rightPaneId ? '68' : '100'} minSize="20" className="min-h-0 min-w-0">
                  {contentPane}
                </Panel>
                {rightDockPanels.length > 0 && (
                  <>
                    <Separator className="w-1 min-w-1 bg-neutral-300/80 dark:bg-neutral-700 hover:bg-blue-400 dark:hover:bg-blue-600 data-[resize-handle-active]:bg-blue-500" />
                    <Panel id="panel-right-dock" defaultSize="32" minSize="15" maxSize="55" className="min-h-0 min-w-0">
                      <Group orientation="vertical" className="h-full min-h-0 min-w-0">
                        {rightDockPanels.map((id, idx) => (
                          <React.Fragment key={id}>
                            {idx > 0 && <Separator className="h-1 min-h-1 bg-neutral-300/80 dark:bg-neutral-700 hover:bg-blue-400 dark:hover:bg-blue-600" />}
                            <Panel id={`panel-\${id}`} className="min-h-0 min-w-0">
                              {renderLayoutPane(id)}
                            </Panel>
                          </React.Fragment>
                        ))}
                      </Group>
                    </Panel>
                  </>
                )}
              </Group>`;

content = content.replace(groupOld, groupNew);

// 4. Update renderLayoutPane
const renderLayoutPaneOld = `  function renderLayoutPane(panelId: string) {
    if (panelId === 'workspace-window') return renderWorkspaceTile()
    if (panelId === 'code-window')
      return (
        <CodeWindowTile
          editorPanels={editorPanels}
          focusedEditorId={focusedEditorId}
          codeWindowTab={codeWindowTab}
          showWorkspaceWindow={showWorkspaceWindow}
          workspaceDockSide={workspaceDockSide}
          applicationSettings={applicationSettings}
          activeTheme={activeTheme}
          settingsHostRef={codeWindowSettingsHostRef}
          onDragOver={(e) => showWorkspaceWindow && handleDragOver(e, { acceptDock: true, targetId: 'dock-code' })}
          onDrop={(e) => showWorkspaceWindow && handleDockDrop(e)}
          onDragStart={(e) => showWorkspaceWindow && handleDragStart(e, 'code', 'code-window')}
          onDragEnd={handleDragEnd}
          onZoomWheel={(e) => {
            if (!isZoomWheelGesture(e)) return
            e.preventDefault()
            if (zoomWheelThrottleRef.current) return
            zoomWheelThrottleRef.current = true
            if (e.deltaY < 0) api.zoomIn?.()
            else if (e.deltaY > 0) api.zoomOut?.()
            const level = api.getZoomLevel?.()
            if (level !== undefined) setZoomLevel(level)
            setTimeout(() => { zoomWheelThrottleRef.current = false }, 120)
          }}
          onDockSideToggle={() => setWorkspaceDockSide((prev) => (prev === 'right' ? 'left' : 'right'))}
          onCloseCodeWindow={() => setShowCodeWindow(false)}
          onCodeWindowTabChange={(tab) => setCodeWindowTab(tab)}
          onFocusedEditorChange={(id) => setFocusedEditor(id)}
          onEditorTabChange={(id) => setFocusedEditor(id)}
          onEditModeToggle={(id) => {
            const panel = editorPanelsRef.current.find((p) => p.id === id)
            const nextMode = !(panel?.editMode ?? false)
            setEditorTabEditMode(id, nextMode)
          }}
          onWordWrapToggle={() => setApplicationSettings((p) => ({ ...p, editorWordWrap: !p.editorWordWrap }))}
          onSave={(id) => void saveEditorPanel(id)}
          onSaveAs={(id) => void saveEditorPanelAs(id)}
          onCloseEditor={closeEditorPanel}
          onEditorContentChange={updateEditorContent}
          onMouseDownCapture={(e) => {
            const target = e.target
            if (target instanceof HTMLElement) {
              if (target.closest('select') || target.closest('button') || target.closest('textarea') || target.closest('.cm-editor') || target.closest('a')) return
            }
            const id = focusedEditorIdRef.current ?? editorPanelsRef.current[0]?.id ?? null
            if (id) setFocusedEditor(id)
          }}
          draggingPanelId={draggingPanelId}
          dragOverTarget={dragOverTarget}
        />
      )
    const agentPanel = panels.find((w) => w.id === panelId)
    if (agentPanel) return renderPanelContent(agentPanel)
    return null
  }`;

const renderLayoutPaneNew = `  function renderLayoutPane(panelId: string) {
    if (panelId === 'workspace-window') return renderWorkspaceTile()
    if (panelId === 'git-window') return renderGitTile()
    if (panelId === 'settings-window') return renderSettingsTile()

    const editorPanel = editorPanels.find(p => p.id === panelId)
    if (editorPanel) return renderEditorPanel(editorPanel)

    const agentPanel = panels.find((w) => w.id === panelId)
    if (agentPanel) return renderPanelContent(agentPanel)

    return null
  }
  
  function renderGitTile() {
    return (
      <WorkspaceTile
        dockTab="git"
        workspaceDockSide={gitDockSide}
        showCodeWindow={true}
        draggingPanelId={null}
        dragOverTarget={null}
        dockContent={
          <GitPane
            gitStatus={gitStatus}
            gitStatusLoading={gitStatusLoading}
            gitStatusError={gitStatusError}
            gitOperationPending={gitOperationPending}
            gitOperationSuccess={gitOperationSuccess}
            workspaceRoot={workspaceRoot ?? ''}
            resolvedSelectedPaths={resolveGitSelection()}
            onRunOperation={(op) => void runGitOperation(op)}
            onRefresh={() => void refreshGitStatus()}
            onEntryClick={handleGitEntryClick}
            onEntryDoubleClick={(relativePath) => void openEditorForRelativePath(relativePath)}
            onEntryContextMenu={openGitContextMenu}
          />
        }
        onMouseDownCapture={() => setFocusedEditorId(null)}
        onDragOver={() => {}}
        onDrop={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onWheel={() => {}}
        onDockTabChange={(tab) => setDockTab(tab)}
        onWorkspaceSettingsTab={workspaceSettings.openWorkspaceSettingsTab}
        onDockSideToggle={() => setGitDockSide((prev) => (prev === 'right' ? 'left' : 'right'))}
        onClose={() => setShowGitWindow(false)}
      />
    )
  }

  function renderSettingsTile() {
    return (
      <WorkspaceTile
        dockTab="settings"
        workspaceDockSide={settingsDockSide}
        showCodeWindow={true}
        draggingPanelId={null}
        dragOverTarget={null}
        dockContent={
          <div className="h-full flex flex-col bg-neutral-50 dark:bg-neutral-900">
            {codeWindowSettingsHostRef.current ? null : <div ref={codeWindowSettingsHostRef} className="flex-1 min-h-0" />}
            <div ref={codeWindowSettingsHostRef} className="flex-1 min-h-0" />
          </div>
        }
        onMouseDownCapture={() => setFocusedEditorId(null)}
        onDragOver={() => {}}
        onDrop={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onWheel={() => {}}
        onDockTabChange={(tab) => setDockTab(tab)}
        onWorkspaceSettingsTab={workspaceSettings.openWorkspaceSettingsTab}
        onDockSideToggle={() => setSettingsDockSide((prev) => (prev === 'right' ? 'left' : 'right'))}
        onClose={() => setShowSettingsWindow(false)}
      />
    )
  }`;

content = content.replace(renderLayoutPaneOld, renderLayoutPaneNew);

fs.writeFileSync('src/App.tsx', content);
