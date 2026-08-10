import json
import re
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from llm_client import match_fields_with_llm, parse_resume
from resume_parser import SUPPORTED_EXTENSIONS, extract_text
from schemas import MatchFieldsRequest, Profile

app = FastAPI(
    title="AI 简历自动填写助手",
    description="上传 PDF 简历，自动解析为结构化个人信息，用于后续表单自动填写。",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent.parent / "data"
PROFILES_DIR = DATA_DIR / "profiles"
LEGACY_PROFILE = DATA_DIR / "profile.json"
STATIC_DIR = Path(__file__).parent / "static"


def _safe_name(name: str) -> str:
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip() or "default"


def _profile_path(name: str) -> Path:
    path = PROFILES_DIR / f"{_safe_name(name)}.json"
    if not path.exists() and LEGACY_PROFILE.exists():
        return LEGACY_PROFILE
    return path


@app.get("/", include_in_schema=False)
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.delete("/profiles/{name}", summary="删除简历版本", tags=["简历管理"])
async def delete_profile(name: str):
    path = PROFILES_DIR / f"{_safe_name(name)}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="简历版本不存在")
    path.unlink()
    return {"deleted": name}


@app.post(
    "/upload-resume",
    response_model=Profile,
    summary="上传简历",
    description="上传 PDF 或 Word 简历，按版本名称保存，支持多份简历共存。",
    tags=["简历管理"],
)
async def upload_resume(
    file: UploadFile = File(..., description="简历文件（支持 .pdf 和 .docx）"),
    profile_name: str = Form(default="default", description="简历版本名称，如'技术岗'、'产品岗'"),
):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="只支持 .pdf 和 .docx 格式")

    content = await file.read()
    text = extract_text(content, file.filename)
    if not text:
        raise HTTPException(status_code=422, detail="无法从文件中提取文本")

    profile = parse_resume(text)
    PROFILES_DIR.mkdir(parents=True, exist_ok=True)
    (PROFILES_DIR / f"{_safe_name(profile_name)}.json").write_text(
        profile.model_dump_json(indent=2), encoding="utf-8"
    )
    return profile


@app.get("/profiles", summary="获取简历版本列表", tags=["简历管理"])
async def list_profiles():
    names: list[str] = []
    if PROFILES_DIR.exists():
        names = sorted(f.stem for f in PROFILES_DIR.glob("*.json"))
    if not names and LEGACY_PROFILE.exists():
        names = ["default"]
    return {"profiles": names}


@app.get(
    "/profile",
    response_model=Profile,
    summary="获取个人信息",
    description="读取指定版本的已解析简历信息。",
    tags=["简历管理"],
)
async def get_profile(name: str = "default"):
    path = _profile_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="尚未上传简历")
    data = json.loads(path.read_text(encoding="utf-8"))
    return Profile(**data)


@app.post(
    "/match-fields",
    summary="匹配表单字段",
    description="根据指定版本简历，将页面字段与个人信息匹配，返回填写建议。",
    tags=["自动填写"],
)
async def match_fields(request: MatchFieldsRequest):
    path = _profile_path(request.profile_name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="尚未上传简历，请先上传")
    profile = json.loads(path.read_text(encoding="utf-8"))
    fields = [f.model_dump() for f in request.fields]
    matches = match_fields_with_llm(fields, profile, request.fill_hint)
    return {"matches": matches}
