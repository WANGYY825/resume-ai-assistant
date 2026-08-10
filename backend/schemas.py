from typing import List, Optional

from pydantic import BaseModel, Field


class Contact(BaseModel):
    email: Optional[str] = Field(default="", description="电子邮箱")
    phone: Optional[str] = Field(default="", description="手机号码")
    location: Optional[str] = Field(default="", description="所在城市")
    linkedin: Optional[str] = Field(default="", description="LinkedIn 主页")
    github: Optional[str] = Field(default="", description="GitHub 主页")


class Education(BaseModel):
    school: str = Field(default="", description="学校名称")
    degree: str = Field(default="", description="学位（本科 / 硕士 / 博士）")
    major: str = Field(default="", description="专业")
    start_date: str = Field(default="", description="入学时间")
    end_date: str = Field(default="", description="毕业时间")


class Experience(BaseModel):
    company: str = Field(default="", description="公司名称")
    title: str = Field(default="", description="职位名称")
    start_date: str = Field(default="", description="入职时间")
    end_date: str = Field(default="", description="离职时间")
    description: str = Field(default="", description="工作内容描述")


class Project(BaseModel):
    name: str = Field(default="", description="项目名称")
    description: str = Field(default="", description="项目描述")
    technologies: List[str] = Field(default=[], description="使用的技术栈")


class Profile(BaseModel):
    name: str = Field(default="", description="姓名")
    contact: Contact = Field(default_factory=Contact, description="联系方式")
    education: List[Education] = Field(default=[], description="教育经历")
    experience: List[Experience] = Field(default=[], description="工作经历")
    projects: List[Project] = Field(default=[], description="项目经历")
    skills: List[str] = Field(default=[], description="技能列表")


class FieldDescriptor(BaseModel):
    index: int = 0
    tag: str = ""
    type: str = ""
    id: str = ""
    name: str = ""
    placeholder: str = ""
    label: str = ""
    selector: str = ""


class MatchFieldsRequest(BaseModel):
    fields: List[FieldDescriptor]
    fill_hint: str = ""
    profile_name: str = "default"
